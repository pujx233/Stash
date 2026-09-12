/* Experimental Loon response probe; binary-body-mode=true is required.
 * One byte only: fu_home_st_opt value "1" -> "0". Native effect is unverified.
 * No network, persistence, decoding of identifiers, or payload logging.
 */
(() => {
  const prefix = "[知乎启动实验] ";
  let result = {};
  try {
    if (!/^https:\/\/api\.zhihu\.com\/lab\/api\/config(?:\?|$)/.test($request.url)) {
      throw new Error("outside endpoint");
    }
    const bytes = $response.body;
    if (Object.prototype.toString.call(bytes) !== "[object Uint8Array]" ||
        !bytes.length || bytes.length > 1024 * 1024) {
      throw new Error("unsupported body");
    }
    // Observed schema contains only length-delimited fields. Reject new wire
    // types rather than guessing; offsets always refer to the original body.
    function fields(start, end) {
      let offset = start;
      const output = [];
      function uint32() {
        let value = 0;
        for (let i = 0; i < 5; i++) {
          if (offset >= end) throw new Error("truncated varint");
          const byte = bytes[offset++];
          if (i === 4 && byte > 15) throw new Error("overflow");
          value += (byte & 127) * Math.pow(128, i);
          if (!(byte & 128)) return value;
        }
        throw new Error("invalid varint");
      }
      while (offset < end) {
        const tag = uint32();
        const number = Math.floor(tag / 8);
        if (number < 1 || number > 536870911 || tag % 8 !== 2) {
          throw new Error("unsupported field");
        }
        const length = uint32();
        if (length > end - offset) throw new Error("truncated field");
        output.push({ number, start: offset, end: offset + length });
        offset += length;
      }
      return output;
    }
    function scalar(list, number) {
      const matches = list.filter(field => field.number === number);
      if (matches.length !== 1) throw new Error("missing or duplicate scalar");
      return matches[0];
    }
    function equals(field, ascii) {
      return field.end - field.start === ascii.length &&
        Array.prototype.every.call(bytes.subarray(field.start, field.end),
          (byte, i) => byte === ascii.charCodeAt(i));
    }
    function keyIdentity(field) {
      if (field.start === field.end) throw new Error("empty map key");
      let identity = "";
      for (let i = field.start; i < field.end; i++) {
        identity += bytes[i].toString(16).padStart(2, "0");
      }
      return identity;
    }
    const seen = new Set();
    const targets = [];
    // Validate the complete envelope and every config before considering a
    // mutation. Duplicate map keys and unknown shapes fail open unchanged.
    for (const field of fields(0, bytes.length)) {
      if (field.number !== 1 && field.number !== 2) throw new Error("unknown envelope");
      const entry = fields(field.start, field.end);
      if (entry.length !== 2) throw new Error("unknown map entry");
      const key = scalar(entry, 1);
      const value = scalar(entry, 2);
      const identity = field.number + ":" + keyIdentity(key);
      if (seen.has(identity)) throw new Error("duplicate map key");
      seen.add(identity);
      if (field.number !== 2) continue;
      const config = fields(value.start, value.end);
      if (config.length < 1 || config.length > 2 ||
          config.some(part => part.number !== 2 && part.number !== 3)) {
        throw new Error("unknown config");
      }
      const setting = scalar(config, 2);
      if (config.length === 2) scalar(config, 3);
      if (equals(key, "fu_home_st_opt")) {
        // The known association is an additional guard, never rewritten.
        if (!equals(scalar(config, 3), "rl-home_startup_opt-1")) {
          throw new Error("unknown experiment");
        }
        if (!equals(setting, "0") && !equals(setting, "1")) {
          throw new Error("unknown target value");
        }
        targets.push(setting);
      }
    }
    if (!targets.length) {
      console.log(prefix + "目标不存在，原样放行");
    } else if (targets.length !== 1) {
      throw new Error("ambiguous target");
    } else if (bytes[targets[0].start] === 48) {
      console.log(prefix + "目标已经为 0，原样放行");
    } else {
      const output = new Uint8Array(bytes);
      output[targets[0].start] = 48;
      result = { body: output };
      console.log(prefix + "fu_home_st_opt: 1 → 0；仅修改 1 字节");
    }
  } catch (_) {
    console.log(prefix + "格式或值不符合已知结构，原样放行");
  }
  $done(result);
})();
