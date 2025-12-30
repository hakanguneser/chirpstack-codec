const { decodeUplink } = require("./lht65n-ds18b20-codec");

/**
 * ChirpStack Base64 -> bytes[] dönüşümü
 */
function base64ToBytes(base64) {
  const buffer = Buffer.from(base64, "base64");
  return Array.from(buffer);
}

// === TEST INPUT (ChirpStack payload) ===
const uplink = {
  fPort: 2,
  data: "zAgKMQIHAX//f/8=",
  variables: {}
};

// Base64 -> bytes
const bytes = base64ToBytes(uplink.data);

// Codec input formatı
const input = {
  fPort: uplink.fPort,
  bytes,
  variables: uplink.variables
};

// Decode
const result = decodeUplink(input);

// Output
console.log("BYTES:", bytes);
console.log("DECODED:");
console.log(JSON.stringify(result, null, 2));
