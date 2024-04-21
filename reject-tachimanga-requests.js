function onRequest(context) {
    var requestHeaders = context.request.headers;
    var userAgent = requestHeaders['User-Agent'];

    console.log("Request Headers:");
    for (var header in requestHeaders) {
        console.log(header + ": " + requestHeaders[header]);
    }

    if (userAgent && userAgent.includes('Tachimanga')) {
        console.log("Blocked a request with User-Agent containing 'Tachimanga'");
        context.reject();
    } else {
        console.log("Allowed a request with User-Agent: " + userAgent);
        context.next();
    }
}
