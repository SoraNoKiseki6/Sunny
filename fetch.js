// ==UserScript==
// @name         京东抢券Fetch捕获并复制链接（保留 key+roleId 且编码 Body）
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  监听 fetch，提取 key+roleId，拼接示例结构并对 Body 做 encodeURIComponent，复制到剪贴板
// @author       Alex
// @match        *://*.jd.com/*
// @updateURL   https://gh-proxy.com/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/fetch.js
// @downloadURL https://gh-proxy.com/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/fetch.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const originalFetch = window.fetch;

    window.fetch = async function(resource, config) {
        try {
            const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
            if (!url.includes('api.m.jd.com/client.action') || !config || config.method !== 'POST') {
                return originalFetch.apply(this, arguments);
            }

            // 解析 POST body 为 key/value
            const params = {};
            try {
                const sp = new URLSearchParams(config.body);
                for (const [k, v] of sp.entries()) {
                    params[k] = v;
                }
            } catch (e) {
                console.warn('Body 解析失败', e);
            }

            // 仅处理 newBabelAwardCollection
            if (params.functionId !== 'newBabelAwardCollection') {
                return originalFetch.apply(this, arguments);
            }

            // 解码并 JSON.parse
            let bodyObj;
            try {
                bodyObj = JSON.parse(decodeURIComponent(params.body || '{}'));
            } catch (e) {
                console.warn('body JSON 解析失败', e);
                return originalFetch.apply(this, arguments);
            }

            const { activityId = '', scene = '', args = '' } = bodyObj;

            // 拆分 args，只保留 key 和 roleId
            const keep = new Set(['key', 'roleId']);
            const parts = args.split(/[,&]/).map(s => s.trim());
            const filtered = parts.filter(item => keep.has(item.split('=')[0]));
            const newArgs = filtered.join(',');

            // 重新构造 Minimal Body 并做 encodeURIComponent
            const minimalBody = JSON.stringify({ activityId, scene, args: newArgs });
            const encodedBody = encodeURIComponent(minimalBody);

            // 拼接最终 URL
            const finalUrl = [
                'https://api.m.jd.com/client.action',
                `?functionId=${params.functionId}`,
                `&body=${encodedBody}`,
                `&appid=babelh5`,
                `&client=wh5`
            ].join('');

            console.log('[抓取] 京东抢券API 完整链接:', finalUrl);

            // 复制到剪贴板
            try {
                await navigator.clipboard.writeText(finalUrl);
            } catch {
                console.warn('复制失败，请手动复制:', finalUrl);
            }

        } catch (err) {
            console.error('fetch 重写捕获异常', err);
        }

        return originalFetch.apply(this, arguments);
    };
})();
