// No require('node-fetch') needed in Node 18+ environments like Netlify
exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { endpoint, key, body, headers = {} } = JSON.parse(event.body);
        
        if (!endpoint || !key || !body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields: endpoint, key, or body" })
            };
        }

        console.log(`[AI-PROXY] Proxying request to: ${endpoint}`);

        const mergedHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            ...headers
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: mergedHeaders,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        return {
            statusCode: response.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("[AI-PROXY] Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
