const targetUserAgent = 'Tachimanga';

if ($request && $request.headers && $request.headers['User-Agent']) {
    let userAgent = $request.headers['User-Agent'];
    if (userAgent.includes(targetUserAgent)) {
        console.log("Blocking request with User-Agent containing 'Tachimanga'");
        $done({ response: { status: 403, body: 'Access denied' } });
    } else {
        console.log("Request allowed with User-Agent: " + userAgent);
        $done({});
    }
} else {
    $done({});
}
