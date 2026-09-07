// 知乎精简 2026-09-08
// API coverage informed by Kelee's Zhihu_remove_ads.lpx and fmz200's zhihu.js.
// No account data is stored or sent by this script.
(() => {
  "use strict";
  const args = typeof $argument === "object" && $argument ? $argument : {};
  const simplify = ![false, "false", 0, "0"].includes(args.simplify);
  const url = $request.url || "";
  const match = /^https:\/\/([a-z0-9-]+)\.zhihu\.com(\/[^?#]*)(?:[?#]|$)/i.exec(url);
  if (!match) return $done({});
  const host = match[1];
  const path = match[2];

  if (typeof $response === "undefined") {
    if (simplify && host === "api" && /^\/moments_v\d+$/.test(path)) {
      const latest = url.replace(/([?&])feed_type=recommend(?=&|$)/, "$1feed_type=timeline");
      if (latest !== url) {
        console.log("[知乎精简] 关注请求已切换为最新时间线");
        return $done({ url: latest });
      }
    }
    return $done({});
  }

  const isTabs = host === "api" && /^\/root\/tab\/v\d+$/.test(path);
  const isConfig = host === "m-cloud" && path === "/api/cloud/zhihu/config/all";
  const isContent = ["api", "www", "page-info", "zhuanlan"].includes(host) && (
    /^\/moments(?:_v\d+)?$/.test(path) ||
    /^\/moments\/(?:recommend|timeline)$/.test(path) ||
    /^\/topstory\/(?:recommend|hot-lists)(?:\/|$)/.test(path) ||
    /^\/questions\/\d+\/feeds(?:\/|$)/.test(path) ||
    /^\/(?:answers|articles|pins)\/v\d+\/\d+(?:\/|$)/.test(path) ||
    /^\/(?:api\/)?v\d+\/(?:questions|answers|articles)\//.test(path) ||
    /^\/next-(?:bff|data|render)$/.test(path) ||
    /^\/comment_v\d+\//.test(path)
  );
  if ((!isTabs && !isConfig && !isContent) || !$response.body || typeof $response.body !== "string") {
    return $done({});
  }

  const count = { ads: 0, fields: 0, tabs: 0, network: 0 };
  try {
    // Keep 64-bit answer/video IDs exact while changing unrelated JSON fields.
    const codec = protectIntegers($response.body);
    const data = JSON.parse(codec.text);
    if (!data || typeof data !== "object") return $done({});
    if (isTabs) {
      if (simplify && Array.isArray(data.tab_list)) {
        const following = data.tab_list.filter(tab => tab && tab.tab_type === "follow");
        if (following.length) {
          count.tabs = data.tab_list.length - following.length;
          data.tab_list = following;
        }
      }
    } else if (isConfig) {
      cleanNetworkConfig(data);
    } else {
      cleanContent(data);
    }
    if (!Object.values(count).some(n => n > 0)) {
      console.log("[知乎精简] " + category() + "：已检查，无需修改");
      return $done({});
    }
    const body = codec.restore(JSON.stringify(data));
    console.log("[知乎精简] " + category() + "：广告条目=" + count.ads + "，广告字段=" + count.fields + "，标签=" + count.tabs + "，网络配置=" + count.network);
    return $done({ body });
  } catch (_) {
    console.log("[知乎精简] 响应无法安全处理，已保留原文");
    return $done({});
  }

  function category() {
    if (isTabs) return "首页标签";
    if (isConfig) return "知乎网络配置";
    if (path.startsWith("/moments")) return "关注信息流";
    if (path.startsWith("/comment_")) return "评论区";
    if (path.startsWith("/topstory/")) return "首页信息流";
    return "回答和文章";
  }
  function meaningful(value) {
    if (value === null || value === undefined || value === false || value === "" || value === 0) return false;
    return typeof value !== "object" || Object.keys(value).length > 0;
  }
  function adType(value) {
    return typeof value === "string" && (
      /^(?:adcard|aditem|adinfo|feedadvert)$/i.test(value) ||
      /(?:^|[_-])(?:ad|ads|advert|advertisement|sponsored|promoted)(?:[_-]|$)/i.test(value)
    );
  }
  function isAd(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if ([true, 1, "1"].includes(item.is_ad) || [true, 1, "1"].includes(item.is_advert)) return true;
    if ([item.type, item.resource_type, item.card_type, item.business_type].some(adType)) return true;
    if ([item.adjson, item.ad_json, item.ad, item.promotion_extra].some(meaningful)) return true;
    const origin = item.origin_data;
    if (origin && [origin.type, origin.resource_type, origin.card_type].some(adType)) return true;
    const elements = item.common_card && item.common_card.footline && item.common_card.footline.elements;
    return Array.isArray(elements) && elements.some(element => {
      const label = element && element.text && element.text.panel_text;
      return typeof label === "string" && /^(?:广告|推广|赞助)$/.test(label.trim());
    });
  }
  function cleanContent(node) {
    if (!node || typeof node !== "object") return;
    const adFields = ["ad_info", "adjson", "ad_json", "ad_list", "advert_info", "adverts", "third_business", "float_search_word", "atmosphere_voting_config", "continuous_consumption_module"];
    for (const key of Object.keys(node)) {
      if (adFields.includes(key)) {
        delete node[key];
        count.fields++;
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        node[key] = value.filter(item => {
          if (isAd(item)) { count.ads++; return false; }
          cleanContent(item);
          return true;
        });
      } else {
        cleanContent(value);
      }
    }
  }
  function cleanNetworkConfig(data) {
    if (!data.data || !Array.isArray(data.data.configs)) return;
    const remove = new Set([
      "km_httpdns_new_config_tars", "preFetchHttpDns", "httpdns_detector_use_concurrent",
      "httpdns_use_memory_cache", "httpdns_new_config_tars", "coreNetworkConf_useTars",
      "km_coreNetworkConf_useTars", "sugarQuicConfig", "quic_dns_detect_enable",
      "quicMixAB", "quic_downgrade_enable", "quic_priority_strategy", "quic_check_health_enable",
      "tquic_configuration", "networkExprimentList", "tars_ab_list", "zaSetExtraRequestHeader"
    ]);
    data.data.configs = data.data.configs.filter(config => {
      if (!config || typeof config !== "object") return true;
      if (remove.has(config.configKey)) { count.network++; return false; }
      if (config.configValue && typeof config.configValue === "object") {
        for (const key of ["delayHttpdns", "dnsParser", "HTTPDNS"]) {
          if (Object.prototype.hasOwnProperty.call(config.configValue, key)) {
            delete config.configValue[key];
            count.network++;
          }
        }
      }
      return true;
    });
  }
  function protectIntegers(text) {
    let prefix = "__ZHILITE_NUMBER_";
    while (text.includes(prefix)) prefix += "_";
    const originals = [];
    // Consume quoted strings whole; only unquoted integer tokens are protected.
    const encoded = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
      if (!/^-?\d+$/.test(token) || Number.isSafeInteger(Number(token))) return token;
      originals.push(token);
      return '"' + prefix + (originals.length - 1) + '__"';
    });
    return {
      text: encoded,
      restore: result => result.replace(new RegExp('"' + prefix + '(\\d+)__"', "g"), (_, index) => originals[Number(index)])
    };
  }
})();
