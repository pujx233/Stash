function onRequest(context) {
    var userAgent = context.request.headers['User-Agent'];
    if (userAgent && userAgent.includes('Tachimanga')) {
        // 拒绝请求
        context.reject();
    } else {
        // 允许请求继续
        context.next();
    }
}