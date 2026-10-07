/** One Gemini call with structured JSON output (plain fetch, no SDK). Used by tiers 2 and 3. */
export async function askGemini<T>(parts: object[], responseSchema: object): Promise<T | undefined> {
    // Fail fast (30s) so a slow call does not stall the run.
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
            generationConfig: { responseMimeType: 'application/json', responseSchema },
            contents: [{ parts }],
        }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? (JSON.parse(text) as T) : undefined;
}
