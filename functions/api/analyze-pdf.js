export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.OPENAI_API_KEY) {
      return json({ error: 'Server missing OPENAI_API_KEY' }, 500);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return json({ error: 'Missing file upload' }, 400);
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return json({ error: 'Only PDF files are supported' }, 400);
    }

    const uploadForm = new FormData();
    uploadForm.append('purpose', 'user_data');
    uploadForm.append('file', file, file.name);

    const fileUploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: uploadForm,
    });

    if (!fileUploadResp.ok) {
      const detail = await fileUploadResp.text();
      return json({ error: 'OpenAI file upload failed', detail }, 502);
    }

    const uploaded = await fileUploadResp.json();
    const model = env.OPENAI_PDF_MODEL || 'gpt-4o-mini';

    const analysisResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_file', file_id: uploaded.id },
              {
                type: 'input_text',
                text:
                  'Analyze this study PDF and return STRICT JSON with keys: summary (string), likelyTopics (string[]), difficultyEstimate (string), vocabTerms (string[]), practiceQuestionIdeas (string[]). Keep arrays concise and practical.',
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    });

    if (!analysisResp.ok) {
      const detail = await analysisResp.text();
      return json({ error: 'OpenAI analysis failed', detail }, 502);
    }

    const analysisJson = await analysisResp.json();
    const rawText = analysisJson.output_text || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {
        summary: rawText,
        likelyTopics: [],
        difficultyEstimate: '',
        vocabTerms: [],
        practiceQuestionIdeas: [],
      };
    }

    return json({
      analysis: {
        summary: String(parsed.summary || ''),
        likelyTopics: Array.isArray(parsed.likelyTopics) ? parsed.likelyTopics.map(String) : [],
        difficultyEstimate: String(parsed.difficultyEstimate || ''),
        vocabTerms: Array.isArray(parsed.vocabTerms) ? parsed.vocabTerms.map(String) : [],
        practiceQuestionIdeas: Array.isArray(parsed.practiceQuestionIdeas) ? parsed.practiceQuestionIdeas.map(String) : [],
      },
    });
  } catch (error) {
    return json({ error: 'Unexpected analysis error', detail: String(error?.message || error) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
