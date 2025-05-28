// ==UserScript==
// @name         京东抢券Fetch捕获并复制链接
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  监听fetch请求，捕获拼接京东抢券API链接并自动复制到剪贴板
// @author       ChatGPT
// @match        *://*.jd.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const originalFetch = window.fetch;

    window.fetch = async function(resource, config) {
        try {
            let url = typeof resource === 'string' ? resource : resource.url || '';
            if (url.includes('api.m.jd.com/client.action') && config && config.method === 'POST') {
                let bodyStr = config.body;
                let params = {};
                try {
                    let sp = new URLSearchParams(bodyStr);
                    for (const [k,v] of sp.entries()) {
                        params[k] = v;
                    }
                } catch(e){}

                if(params.functionId && params.functionId === 'newBabelAwardCollection') {
                    let bodyJsonStr = params.body || '{}';
                    try {
                        let bodyObj = JSON.parse(decodeURIComponent(bodyJsonStr));
                        let activityId = bodyObj.activityId || '';
                        let scene = bodyObj.scene || '';
                        let args = bodyObj.args || '';
                        let log = bodyObj.log || '';
                        let random = bodyObj.random || '';

                        let newBody = encodeURIComponent(JSON.stringify({
                            activityId,
                            scene,
                            args,
                            log,
                            random
                        }));

                        let finalUrl = `https://api.m.jd.com/client.action?functionId=${params.functionId}&client=wh5&body=${newBody}`;

                        console.log('[抓取] 京东抢券API完整链接:', finalUrl);

                        // 自动复制到剪贴板（需要页面允许剪贴板权限）
                        try {
                            await navigator.clipboard.writeText(finalUrl);
                            //alert('抢券API链接已复制到剪贴板 🎉');
                        } catch (err) {
                            console.warn('复制链接失败，手动复制链接:', finalUrl);
                        }

                    } catch(e) {
                        console.warn('解析bodyJson失败', e);
                    }
                }
            }
        } catch(e) {
            console.error('fetch重写捕获异常', e);
        }

        return originalFetch.apply(this, arguments);
    };

})();
