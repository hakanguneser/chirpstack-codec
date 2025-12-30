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
  //data: "CQ4JHwGwgWlToZcJFQkoAb+BaVOmRwkbCS0BxYFpU6r3CSEJOQHKgWlTr6cJJwk+AcuBaVO0VwkuCUUB0YFpU7kHCToJTAHUgWlTvbcJQAlQAdeBaVPCZwlHCVkB2YFpU8cXCUcJXQHcgWlTy8cJTQljAduBaVPQdwlTCWcB34FpU9UnCU0JYAHIgWlT2dcJRwlbAcGBaVPehwlHCVsBwIFpU+M3CUcJXAG/gWlT5+cJRwlYAcOBaVPslwlHCVgBw4FpU/FHCUAJVQHHgWlT9fcJOglNAciBaVP6pwk0CUUBzoFpU/9X",
  data: "f/8KugH1gWlUTVt//wq6AfyBaVRNYn//Cr0B7IFpVE14f/8KvgHlgWlUTYJ//wq/AeGBaVRNkn//Cr8B4IFpVE2af/8KwQICgWlUTbB//wrEAh+BaVRNuw==",
  variables: {},
  time: "2025-12-30T09:31:42.973850+00:00"
};

// Base64 -> bytes
const bytes = base64ToBytes(uplink.data);

// Codec input formatı
const input = {
  fPort: uplink.fPort,
  bytes,
  variables: uplink.variables,
  time: uplink.time
};

// Decode
const result = decodeUplink(input);

// Output 
console.log(JSON.stringify(result, null, 2));
