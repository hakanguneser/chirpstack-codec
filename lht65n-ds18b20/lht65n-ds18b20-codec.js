const EXT_SENSOR_DS18B20 = 1;
const EXT_SENSOR_TMP117 = 2;
const EXT_SENSOR_ADC_PT100 = 9;
const EXT_SENSOR_EXT_SC = 4;
const TEMP_ERROR_VAL_LOW = 0x7F;
const TEMP_ERROR_VAL_HIGH = 0xFF;
function decodeUplink(input) {
  return {
    data: Decode(input.fPort, input.bytes, input.variables)
  };
}
function readInt16BE(bytes, idx) {
  const val = (bytes[idx] << 8) | bytes[idx + 1];
  return (val << 16) >> 16;
}
function readUint16BE(bytes, idx) {
  return (bytes[idx] << 8) | bytes[idx + 1];
}
function readUint32BE(bytes, idx) {
  return (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3];
}
function parseDatalogRecord(offset, bytes, order) {
  const measurement = {};
  const extMode = bytes[6] & 0x0F;
  if (bytes[offset] === TEMP_ERROR_VAL_LOW && bytes[offset + 1] === TEMP_ERROR_VAL_HIGH) {
    measurement.probeTemperatureC = null;
  } else if (extMode === EXT_SENSOR_DS18B20 || extMode === EXT_SENSOR_TMP117 || extMode === EXT_SENSOR_ADC_PT100) {
    measurement.probeTemperatureC = parseFloat((readInt16BE(bytes, offset) / 100).toFixed(2));
  }

  measurement.mainTemperatureC = parseFloat((readInt16BE(bytes, offset + 2) / 100).toFixed(2));

  measurement.mainHumidity = parseFloat(((readUint16BE(bytes, offset + 4) & 0xFFF) / 10).toFixed(1));

  const timeVal = readUint32BE(bytes, offset + 7);
  measurement.measuredAt = parseTimestamp(timeVal);
  measurement.measuredAtDisplay = dateToGMT3(measurement.measuredAt);
  measurement.order = order;

  return measurement;
}
function parseTimestamp(val) {
  if (val > 9999999999) {
    return new Date(val).getTime();
  } else {
    return new Date(val * 1000).getTime();
  }
}
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

function dateToGMT3(ms) {
  if (ms === undefined || ms === null) {
    return null;
  }

  return new Date(ms + (3 * 60 * 60 * 1000))
    .toISOString()
    .replace("Z", "+03:00");
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
      type: "STATIONARY_THERMOMETER"
    }
  };

  const now = Date.now();
  if (retransmissionStatus === 0 && pollMessageStatus === 0) {
    const measurement = {
      measuredAt: now,
      measuredAtDisplay: dateToGMT3(now),
      order: 1
    };

    let batRaw, batVolt;
    if (extMode === 0x09) {
      measurement.probeTemperatureC = parseFloat((readInt16BE(bytes, 0) / 100).toFixed(2));
      batRaw = bytes[4];
      batVolt = null;
    } else {
      batVolt = (readUint16BE(bytes, 0) & 0x3FFF) / 1000;
      batRaw = bytes[0];
    }

    result.decodedDeviceInfo.battery = parseBattery(batRaw, batVolt);

    if (extMode !== 0x0F) {
      measurement.mainTemperatureC = parseFloat((readInt16BE(bytes, 2) / 100).toFixed(2));
      measurement.mainHumidity = parseFloat(((readUint16BE(bytes, 4) & 0xFFF) / 10).toFixed(1));
    }
    if (extMode === 0 || (bytes[7] === TEMP_ERROR_VAL_LOW && bytes[8] === TEMP_ERROR_VAL_HIGH)) {
      measurement.probeTemperatureC = null;
    } else if (extMode === EXT_SENSOR_DS18B20 || extMode === EXT_SENSOR_TMP117) {
      measurement.probeTemperatureC = parseFloat((readInt16BE(bytes, 7) / 100).toFixed(2));
    }

    result.measurements.push(measurement);
    return result;
  }
  if (pollMessageStatus === 1 || retransmissionStatus === 1) {
    if (retransmissionStatus === 1) {
      result.decodedDeviceInfo.battery = parseBattery(null, null);
    }
    for (let i = 0; i < bytes.length; i += 11) {
      if (i + 11 > bytes.length) break;
      const record = parseDatalogRecord(i, bytes, (i / 11) + 1);
      result.measurements.push(record);
    }
    return result;
  }
  return {
    errors: ["unknown message type"]
  };
}

module.exports = {
  decodeUplink
};
