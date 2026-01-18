// Constants for External Sensor Types
const EXT_SENSOR_DS18B20 = 1;
const EXT_SENSOR_TMP117 = 2;
const EXT_SENSOR_ADC_PT100 = 9;
const EXT_SENSOR_EXT_SC = 4; // Not explicitly used but good practice if needed

// Constants for Special Values
const TEMP_ERROR_VAL_LOW = 0x7F;
const TEMP_ERROR_VAL_HIGH = 0xFF;

/**
 * Main entry point for ChirpStack
 */
function decodeUplink(input) {
  return {
    data: Decode(input.fPort, input.bytes, input.variables)
  };
}

/**
 * Helper to read signed 16-bit integer (Big Endian)
 */
function readInt16BE(bytes, idx) {
  const val = (bytes[idx] << 8) | bytes[idx + 1];
  // Sign extension for 16-bit
  return (val << 16) >> 16;
}

/**
 * Helper to read unsigned 16-bit integer (Big Endian)
 */
function readUint16BE(bytes, idx) {
  return (bytes[idx] << 8) | bytes[idx + 1];
}

/**
 * Helper to read unsigned 32-bit integer (Big Endian)
 */
function readUint32BE(bytes, idx) {
  return (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3];
}

/**
 * Parses a datalog record
 */
function parseDatalogRecord(offset, bytes, order) {
  const measurement = {};
  const extMode = bytes[6] & 0x0F;

  // External Temperature
  // Check for error/null value: 0x7F 0xFF
  if (bytes[offset] === TEMP_ERROR_VAL_LOW && bytes[offset + 1] === TEMP_ERROR_VAL_HIGH) {
    measurement.externalTemperatureC = null;
  } else if (extMode === EXT_SENSOR_DS18B20 || extMode === EXT_SENSOR_TMP117 || extMode === EXT_SENSOR_ADC_PT100) {
    measurement.externalTemperatureC = parseFloat((readInt16BE(bytes, offset) / 100).toFixed(2));
  }

  // Internal Temperature
  measurement.internalTemperatureC = parseFloat((readInt16BE(bytes, offset + 2) / 100).toFixed(2));

  // Internal Humidity
  measurement.internalHumidity = parseFloat(((readUint16BE(bytes, offset + 4) & 0xFFF) / 10).toFixed(1));

  // Timestamp
  const timeVal = readUint32BE(bytes, offset + 7);
  measurement.measuredAt = parseTimestamp(timeVal);
  measurement.measuredAtDisplay = new Date(measurement.measuredAt)  .toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" });
  measurement.order = order;

  return measurement;
}

/**
 * Converts timestamp to MS. 
 * Handles older firmware sending unix time vs relative/smaller numbers?
 * The original logic had a threshold check.
 */
function parseTimestamp(val) {
  // Original logic: if (str > 9999999999) ...
  // Since we read as number, we compare number. 
  // 9999999999 is ~ year 2286 in seconds, or year 1970 in ms.
  // It seems to differentiate between MS and Seconds timestamps.

  if (val > 9999999999) {
    return new Date(val).getTime(); // Already MS?
  } else {
    return new Date(val * 1000).getTime(); // Seconds to MS
  }
}

/**
 * Battery helpers
 */
function parseBattery(byte, voltage) {
  if (byte === undefined || byte === null) {
    return {
      voltage: voltage ?? null,
      raw: null,
      percent: null,
      label: null
    };
  }

  const raw = (byte >> 6) & 0x03;
  const labels = ["ULTRA LOW", "LOW", "OK", "GOOD"];

  return {
    voltage: voltage ?? null,
    raw: raw,
    percent: Math.round((raw / 3) * 100),
    label: labels[raw] ?? null
  };
}

/**
 * Main Decode Logic
 */
function Decode(fPort, bytes, variables) {
  const extMode = bytes[6] & 0x0F;
  const pollMessageStatus = (bytes[6] >> 6) & 0x01;
  const retransmissionStatus = (bytes[6] >> 7) & 0x01;

  const result = {
    measurements: [],
    decodedDeviceInfo: {
      model: "DRAGINO_LHT65N",
      type: "STATIONARY"
    }
  };

  const now = Date.now();
  // Case 1: Standard Real-time Uplink (No Retransmission, No Poll)
  if (retransmissionStatus === 0 && pollMessageStatus === 0) {
    const measurement = {
      measuredAt: now,
      measuredAtDisplay: new Date(now).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" }),
      order: 1
    };

    // Battery & Status
    let batRaw, batVolt;
    if (extMode === 0x09) {
      // Special case from original code
      measurement.externalTemperatureC = parseFloat((readInt16BE(bytes, 0) / 100).toFixed(2));
      batRaw = bytes[4];
      batVolt = null;
    } else {
      batVolt = (readUint16BE(bytes, 0) & 0x3FFF) / 1000;
      batRaw = bytes[0];
    }

    result.decodedDeviceInfo.battery = parseBattery(batRaw, batVolt);

    // Internal Sensors (Temp & Humidity)
    if (extMode !== 0x0F) { // 0x0F usually means 'interrupt' or 'no sensor' logic? 
      measurement.internalTemperatureC = parseFloat((readInt16BE(bytes, 2) / 100).toFixed(2));
      measurement.internalHumidity = parseFloat(((readUint16BE(bytes, 4) & 0xFFF) / 10).toFixed(1));
    }

    // External Sensor (Standard)
    if (extMode === 0 || (bytes[7] === TEMP_ERROR_VAL_LOW && bytes[8] === TEMP_ERROR_VAL_HIGH)) {
      measurement.externalTemperatureC = null;
    } else if (extMode === EXT_SENSOR_DS18B20 || extMode === EXT_SENSOR_TMP117) {
      measurement.externalTemperatureC = parseFloat((readInt16BE(bytes, 7) / 100).toFixed(2));
    }

    result.measurements.push(measurement);
    return result;
  }

  // Case 2: Datalog / Retransmission (Multiple Measurements)
  // Logic: Poll=1 OR Retransmission=1 means bulk data.
  // Each record is 11 bytes.
  if (pollMessageStatus === 1 || retransmissionStatus === 1) {
    if (retransmissionStatus === 1) {
      // In original code, battery info is nulled for retransmission
      result.decodedDeviceInfo.battery = parseBattery(null, null);
    }

    // Parse chunks of 11 bytes
    for (let i = 0; i < bytes.length; i += 11) {
      if (i + 11 > bytes.length) break; // Safety check
      const record = parseDatalogRecord(i, bytes, (i / 11) + 1);
      result.measurements.push(record);
    }

    // Original code did NOT return 'DATALOG' key for retransmission (Status=1), only for polling (Status=0, Poll=1)?
    // Actually original code:
    // Case 1 (Poll=1) -> returns decode.DATALOG (sum of objects? bug?) 
    // Case 2 (Retrans=1) -> returns decode.measurements
    // My previous fix made both use measurementList.
    // I will standardise on `measurements` array.

    return result;
  }

  // Fallback
  return {
    errors: ["unknown message type"]
  };
}

module.exports = {
  decodeUplink
};
