// 知乎去广告 2026-09-08：单关注标签的布局开关对照，尚待实机验证。
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

  if (typeof $response === "undefined") return $done({});

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

  const count = { ads: 0, recommendations: 0, fields: 0, tabs: 0, network: 0 };
  try {
    // Keep 64-bit answer/video IDs exact while changing unrelated JSON fields.
    const codec = protectIntegers($response.body);
    const data = JSON.parse(codec.text);
    if (!data || typeof data !== "object") return $done({});
    if (isTabs) {
      if (simplify && Array.isArray(data.tab_list)) {
        if (data.tab_list.some(tab => tab && tab.tab_type === "follow")) {
          const tabs = data.tab_list.filter(tab => tab && tab.tab_type === "follow");
          count.tabs = data.tab_list.length - tabs.length;
          data.tab_list = tabs;
        }
      }
    } else if (isConfig) {
      cleanNetworkConfig(data);
    } else {
      if (simplify) cleanRecommendationModules(data);
      cleanContent(data);
    }
    if (!Object.values(count).some(n => n > 0)) {
      console.log("[知乎去广告] " + category() + "：已检查，无需修改");
      return $done({});
    }
    const body = codec.restore(JSON.stringify(data));
    console.log("[知乎去广告] " + category() + "：广告条目=" + count.ads + "，推荐模块=" + count.recommendations + "，广告字段=" + count.fields + "，标签=" + count.tabs + "，网络配置=" + count.network);
    return $done({ body });
  } catch (_) {
    console.log("[知乎去广告] 响应无法安全处理，已保留原文");
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
  // Match module metadata at known feed boundaries, never words in answer/comment bodies.
  // Evidence: fmz200's /moments_v3 title and /next-bff origin_data.next_guide handling.
  // A real /moments_v3 timeline capture also puts this label in ComponentCard
  // moments_biz_data.action_text and Author.desc_line, not in a module title.
  function cleanRecommendationModules(data) {
    const labels = new Set(["为您推荐", "为你推荐", "你可能感兴趣", "推荐的相关内容"]);
    const isLabel = value => typeof value === "string" && labels.has(value.trim());
    const hasRecommendationHint = value => typeof value === "string" &&
      value.split(/[·•]/).some(part => isLabel(part));
    const injectedFollowCard = item => {
      if (item.type === "ComponentCard") {
        const business = item.extra && item.extra.business_ext_map && item.extra.business_ext_map.moments_biz_data;
        if (business && hasRecommendationHint(business.action_text)) return true;
        return Array.isArray(item.children) && item.children.some(child =>
          child && child.type === "Author" && child.desc_line &&
          Array.isArray(child.desc_line.elements) && child.desc_line.elements.some(element =>
            element && element.type === "Text" && hasRecommendationHint(element.text)));
      }
      return item.type === "moments_feed" && item.source && hasRecommendationHint(item.source.action_text);
    };
    const isContentObject = value => value && typeof value === "object" && (
      ["answer", "article", "question", "pin", "comment", "zvideo"].includes(value.type) ||
      typeof value.content === "string" || typeof value.excerpt === "string"
    );
    const removeFrom = (owner, key, predicate) => {
      if (!owner || !Array.isArray(owner[key])) return;
      owner[key] = owner[key].filter(item => {
        if (item && typeof item === "object" && predicate(item)) {
          count.recommendations++;
          return false;
        }
        return true;
      });
    };
    if (host === "api" && (/^\/moments(?:_v\d+)?$/.test(path) || /^\/moments\/(?:recommend|timeline)$/.test(path))) {
      removeFrom(data, "data", item => injectedFollowCard(item) || (isLabel(item.title) &&
        !isContentObject(item) && !isContentObject(item.target)));
    } else if (path === "/next-bff") {
      removeFrom(data, "data", item => isLabel(item.origin_data && item.origin_data.next_guide && item.origin_data.next_guide.title));
    } else if (path === "/next-data") {
      removeFrom(data.data, "data", item => isLabel(item.next_guide && item.next_guide.title));
    }
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
      // Native telemetry confirms ZHTopBarPageView.viewControllerAtIndex
      // runs out of bounds after caching the single Follow tab.
      // Controlled test: disable the observed left-move feature via its status;
      // configValue is not the on/off gate. Client behavior still needs validation.
      if (simplify && config.configKey === "follow_tab_is_move_left" && config.status === true) {
        config.status = false;
        count.network++;
      }
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
