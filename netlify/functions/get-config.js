exports.handler = async (event, context) => {
    // Only allow authorized users (Netlify Identity)
    const { user } = context.clientContext;
    if (!user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Unauthorized" })
        };
    }

    // Return secrets from Netlify Environment Variables
    return {
        statusCode: 200,
        body: JSON.stringify({
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            GITHUB_TOKEN: process.env.GITHUB_TOKEN,
            DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
            MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_KEY: process.env.SUPABASE_KEY,
            PRODUCTION_URL: process.env.PRODUCTION_URL
        })
    };
};
