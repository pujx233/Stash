function onRequest(context) {
    var userAgent = context.request.headers['User-Agent'];
    if (userAgent && userAgent.includes('Tachimanga')) {
        context.reject();
    } else {
        context.next();
    }
}