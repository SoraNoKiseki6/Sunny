// ==UserScript==
// @name         京东抢券Fetch捕获并复制链接（raw JSON body）
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  监听 fetch，提取 key + roleId，拼出示例结构，不做 body 编码复制到剪贴板
// @author       Alex
// @match        *://*.jd.com/*
// @updateURL   https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/fetch.js
// @downloadURL https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/fetch.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const originalFetch = window.fetch;

    window.fetch = async function(resource, config) {
        try {
            const url = typeof resource === 'string' ? resource : resource.url || '';
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

            // 只捕获 newBabelAwardCollection
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
            const keepKeys = new Set(['key', 'roleId']);
            const parts = args.split(/[,&]/).map(s => s.trim());
            const filtered = parts.filter(item => keepKeys.has(item.split('=')[0]));
            const newArgs = filtered.join(',');

            // 构造 raw JSON body
            const rawBody = JSON.stringify({ activityId, scene, args: newArgs });

            // 拼出最终链接（不做任何 encodeURIComponent）
            const finalUrl =
                'https://api.m.jd.com/client.action' +
                '?functionId=' + params.functionId +
                '&body=' + rawBody +
                '&appid=babelh5' +
                '&client=wh5';

            console.log('[抓取] 京东抢券API 完整链接（raw body）:', finalUrl);

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
