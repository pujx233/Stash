// reject-tachimanga-requests.js
function onRequest(context) {
  var userAgent = context.request.headers['User-Agent'];
  if (userAgent.includes('Tachimanga')) {
    // 拒绝此请求
    context.reject();
  } else {
    // 允许请求继续
    context.next();
  }
}