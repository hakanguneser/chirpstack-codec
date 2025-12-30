function decodeUplink(input) {
  return {
    data: Decode(input.fPort, input.bytes, input.variables)
  };
}

function datalog(i, bytes) {
  var measurement = {};
  var Ext = bytes[6] & 0x0F;
  if (bytes[i] == '127' && bytes[1 + i] == '255') {
    measurement.externalTemperatureC = null;
  } else if (Ext === 1 || Ext === 2 || Ext === 9) {
    measurement.externalTemperatureC = parseFloat((((bytes[i] << 24 >> 16) | bytes[i + 1]) / 100).toFixed(2));
  }
  measurement.internalTemperatureC = parseFloat(((bytes[2 + i] << 24 >> 16 | bytes[3 + i]) / 100).toFixed(2));
  measurement.internalHumidity = parseFloat((((bytes[4 + i] << 8 | bytes[5 + i]) & 0xFFF) / 10).toFixed(1));
  measurement.measuredAt = getMyDate((bytes[7 + i] << 24 | bytes[8 + i] << 16 | bytes[9 + i] << 8 | bytes[10 + i]).toString(10)).getTime();
  return measurement;
}

function getMyDate(str) {
  if (str > 9999999999)
    return new Date(parseInt(str));
  else
    return new Date(parseInt(str) * 1000);
}

function Decode(fPort, bytes, variables) {
  var Ext = bytes[6] & 0x0F;
  var poll_message_status = ((bytes[6] >> 6) & 0x01);
  var retransmission_Status = ((bytes[6] >> 7) & 0x01);
  var decode = {};
  var data = {};
  var measurement = {};
  var measurementList = [];
  var deviceInfo = {};

  if (retransmission_Status == 0) {
    switch (poll_message_status) {
      case 0:
        {
          if (Ext == 0x09) {
            measurement.externalTemperatureC = parseFloat(((bytes[0] << 24 >> 16 | bytes[1]) / 100).toFixed(2));
            deviceInfo.batteryStatus = bytes[4] >> 6;
          }
          else {
            deviceInfo.battery = ((bytes[0] << 8 | bytes[1]) & 0x3FFF) / 1000;
            deviceInfo.batteryStatus = bytes[0] >> 6;
          }

          if (Ext != 0x0f) {
            measurement.internalTemperatureC = parseFloat(((bytes[2] << 24 >> 16 | bytes[3]) / 100).toFixed(2));
            measurement.internalHumidity = parseFloat((((bytes[4] << 8 | bytes[5]) & 0xFFF) / 10).toFixed(1));
          }
          if (Ext == '0' || (bytes[7] == '127' && bytes[8] == '255')) {
            measurement.externalTemperatureC = null;
          }
          else if (Ext == 1 || Ext == 2) {
            measurement.externalTemperatureC =
              parseFloat(((bytes[7] << 24 >> 16 | bytes[8]) / 100).toFixed(2));
          }

        }
        deviceInfo.nodeType = "LHT65N";
        measurement.measuredAt = Date.now();
        measurementList.push(measurement);
        decode.measurements = measurementList;
        decode.deviceInfo = deviceInfo;
        if ((bytes.length == 11) || (bytes.length == 15)) {
          return decode;
        }
        break;

      case 1:
        {
          for (var i = 0; i < bytes.length; i = i + 11) {
            var da = datalog(i, bytes);
            if (i == '0')
              decode.DATALOG = da;
            else
              decode.DATALOG += da;
          }
          deviceInfo.nodeType = "LHT65N";
          decode.deviceInfo = deviceInfo;
        }
        {
          return decode;
        }
        break;
      default:
        return {
          errors: ["unknown"]
        }
    }
  }
  else {
    switch (retransmission_Status) {
      case 1:
        {
          for (var i = 0; i < bytes.length; i = i + 11) {
            var da = datalog(i, bytes);
            measurementList.push(da);
          }
          deviceInfo.nodeType = "LHT65N";
          deviceInfo.battery = null;
          deviceInfo.batteryStatus = null;
          decode.deviceInfo = deviceInfo;
          decode.measurements = measurementList;
        }
        {
          return decode;
        }
        break;
      default:
        return {
          errors: ["unknown"]
        }
    }
  }
}


module.exports = {
  decodeUplink
};
