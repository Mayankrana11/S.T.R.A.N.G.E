
export async function browserNavigate(args) {
    return {
        success: true,
        action: "navigate",
        url: args.url,
        simulated: true
    };
}

export async function browserSearch(args) {
    return {
        success: true,
        query: args.query,
        results: [
            {
                title: "Example result",
                url: "https://example.com"
            }
        ],
        simulated: true
    };
}
