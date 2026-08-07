import { workflow, node, trigger, expr, ifElse } from '@n8n/workflow-sdk'

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'CV Rewrite Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'cv-rewrite',
      responseMode: 'lastNode',
      responseData: 'firstEntryJson',
      options: {},
    },
  },
})

const normalizeInput = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Input',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'cv-id', name: 'cvId', value: expr('{{ $json.body?.cvId ?? $json.cvId ?? 0 }}'), type: 'number' },
          { id: 'jd', name: 'targetJobDescription', value: expr('{{ $json.body?.targetJobDescription ?? $json.targetJobDescription ?? "" }}'), type: 'string' },
          { id: 'cv-text', name: 'originalCv', value: expr('{{ $json.body?.originalCv ?? $json.originalCv ?? "" }}'), type: 'string' },
          { id: 'suggestions', name: 'approvedSuggestions', value: expr('{{ $json.body?.approvedSuggestions ?? $json.approvedSuggestions ?? [] }}'), type: 'array' },
        ],
      },
    },
  },
})

const rewriteSystemPrompt =
  'Kamu adalah penulis CV profesional. Tulis ulang CV asli menjadi CV ATS-friendly ' +
  'yang cocok dengan deskripsi pekerjaan, DENGAN MENERAPKAN SEMUA saran yang disetujui. ' +
  'PERTAHANKAN SEMUA fakta dari CV asli (nama, tanggal, perusahaan, pendidikan, angka) ' +
  '- jangan menambah atau mengubah fakta. ' +
  'Tulis CV dalam bahasa yang sama dengan deskripsi pekerjaan (JD), kecuali diminta lain. ' +
  'Format: markdown dengan heading standar (Pengalaman Kerja, Pendidikan, Keahlian), ' +
  'single column, bullet points, tanpa gambar atau tabel. ' +
  'Kembalikan HANYA markdown CV hasil tulis ulang tanpa penjelasan.'

const rewriteM1 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Rewrite - Model 1',
    position: [540, 300],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Normalize Input").item.json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($("Normalize Input").item.json.approvedSuggestions) }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const rewriteM2 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Rewrite - Model 2',
    position: [540, 480],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Normalize Input").item.json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($("Normalize Input").item.json.approvedSuggestions) }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const rewriteM3 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Rewrite - Model 3',
    position: [540, 660],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Normalize Input").item.json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($("Normalize Input").item.json.approvedSuggestions) }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const rewriteM4 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Rewrite - Model 4',
    position: [540, 840],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'google/gemma-4-31b-it:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Normalize Input").item.json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($("Normalize Input").item.json.approvedSuggestions) }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const rewriteM5 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Rewrite - Model 5',
    position: [540, 1020],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'openai/gpt-oss-20b:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Normalize Input").item.json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($("Normalize Input").item.json.approvedSuggestions) }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const captureRewrite = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Capture Rewrite',
    parameters: {
      mode: 'manual',
      includeOtherFields: true,
      assignments: {
        assignments: [
          { id: 'model', name: 'model', value: expr('{{ $json.model }}'), type: 'string' },
          { id: 'raw', name: 'raw', value: expr('{{ $json.choices?.[0]?.message?.content ?? "" }}'), type: 'string' },
          { id: 'orig', name: 'originalCv', value: expr('{{ $("Normalize Input").item.json.originalCv }}'), type: 'string' },
          { id: 'jd', name: 'targetJobDescription', value: expr('{{ $("Normalize Input").item.json.targetJobDescription }}'), type: 'string' },
          { id: 'sug', name: 'approvedSuggestions', value: expr('{{ $("Normalize Input").item.json.approvedSuggestions }}'), type: 'array' },
        ],
      },
    },
  },
})

// tradeoff: Post-check chain intentionally reorders the failover models instead
// of following OPENROUTER_FREE_MODELS: gemma/gpt-oss run first because they
// support response_format: json_object (reliable JSON post-check), the nemotron
// models follow with reasoning.enabled: false. Ceiling: two model orders to
// maintain. Upgrade trigger: keep this order in sync with OPENROUTER_FREE_MODELS
// when models are added/retired, or switch to structured-output-only models.

const postCheckSystemPrompt =
  'Kamu adalah penilai ATS. Bandingkan CV hasil tulis ulang dengan CV asli. ' +
  'Pastikan SEMUA fakta penting (nama, tanggal, pengalaman, pendidikan, keterampilan, angka) ' +
  'masih ada dan tidak berubah. ' +
  'Kembalikan HANYA JSON tanpa markdown code fence dengan format: ' +
  '{"postScore": number 0-100, "warnings": [string]} ' +
  'untuk setiap fakta yang hilang atau berubah. Gunakan bahasa Indonesia.'

const postM1 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Post-Check Model 1',
    position: [1120, 300],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'google/gemma-4-31b-it:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Capture Rewrite").item.json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $("Capture Rewrite").item.json.raw }}\n\nDeskripsi pekerjaan:\n{{ $("Capture Rewrite").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const postM2 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Post-Check Model 2',
    position: [1120, 480],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'openai/gpt-oss-20b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Capture Rewrite").item.json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $("Capture Rewrite").item.json.raw }}\n\nDeskripsi pekerjaan:\n{{ $("Capture Rewrite").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const postM3 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Post-Check Model 3',
    position: [1120, 660],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Capture Rewrite").item.json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $("Capture Rewrite").item.json.raw }}\n\nDeskripsi pekerjaan:\n{{ $("Capture Rewrite").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        reasoning: { enabled: false },
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const postM4 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Post-Check Model 4',
    position: [1120, 840],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Capture Rewrite").item.json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $("Capture Rewrite").item.json.raw }}\n\nDeskripsi pekerjaan:\n{{ $("Capture Rewrite").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        reasoning: { enabled: false },
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const postM5 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Post-Check Model 5',
    position: [1120, 1020],
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openRouterApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: {
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $("Capture Rewrite").item.json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $("Capture Rewrite").item.json.raw }}\n\nDeskripsi pekerjaan:\n{{ $("Capture Rewrite").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 4096,
        reasoning: { enabled: false },
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const rewriteValidM1 = ifElse({
  version: 2.3,
  config: {
    name: 'Rewrite Valid Model 1',
    position: [880, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const rewriteValidM2 = ifElse({
  version: 2.3,
  config: {
    name: 'Rewrite Valid Model 2',
    position: [880, 480],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const rewriteValidM3 = ifElse({
  version: 2.3,
  config: {
    name: 'Rewrite Valid Model 3',
    position: [880, 660],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const rewriteValidM4 = ifElse({
  version: 2.3,
  config: {
    name: 'Rewrite Valid Model 4',
    position: [880, 840],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const postValidM1 = ifElse({
  version: 2.3,
  config: {
    name: 'Post-Check Valid Model 1',
    position: [1480, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const postValidM2 = ifElse({
  version: 2.3,
  config: {
    name: 'Post-Check Valid Model 2',
    position: [1480, 480],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const postValidM3 = ifElse({
  version: 2.3,
  config: {
    name: 'Post-Check Valid Model 3',
    position: [1480, 660],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const postValidM4 = ifElse({
  version: 2.3,
  config: {
    name: 'Post-Check Valid Model 4',
    position: [1480, 840],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ !$json.error }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.message?.content ?? "").trim().length > 0 }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
          { leftValue: expr('{{ ($json.choices?.[0]?.finish_reason ?? "stop") !== "length" }}'), operator: { type: 'boolean', operation: 'equals' }, rightValue: true },
        ],
        combinator: 'and',
      },
    },
  },
})

const formatOutput = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Format Output',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'model', name: 'model', value: expr('{{ $("Capture Rewrite").item.json.model }}'), type: 'string' },
          { id: 'raw', name: 'raw', value: expr('{{ $("Capture Rewrite").item.json.raw }}'), type: 'string' },
          { id: 'post-model', name: 'postCheckModel', value: expr('{{ $json.model }}'), type: 'string' },
          { id: 'post-raw', name: 'postCheckRaw', value: expr('{{ $json.choices?.[0]?.message?.content ?? "" }}'), type: 'string' },
        ],
      },
    },
  },
})

export default workflow('cv-ats-rewrite', 'CV ATS Rewrite')
  .add(webhook)
  .to(normalizeInput)
  .to(
    rewriteM1
      .to(
        rewriteValidM1
          .onTrue(captureRewrite)
          .onFalse(
            rewriteM2
              .to(
                rewriteValidM2
                  .onTrue(captureRewrite)
                  .onFalse(
                    rewriteM3
                      .to(
                        rewriteValidM3
                          .onTrue(captureRewrite)
                          .onFalse(
                            rewriteM4
                              .to(
                                rewriteValidM4
                                  .onTrue(captureRewrite)
                                  .onFalse(rewriteM5.to(captureRewrite)),
                              )
                              .onError(rewriteM5),
                          ),
                      )
                      .onError(rewriteM4),
                  ),
              )
              .onError(rewriteM3),
          ),
      )
      .onError(rewriteM2),
  )
  .add(captureRewrite)
  .to(
    postM1
      .to(
        postValidM1
          .onTrue(formatOutput)
          .onFalse(
            postM2
              .to(
                postValidM2
                  .onTrue(formatOutput)
                  .onFalse(
                    postM3
                      .to(
                        postValidM3
                          .onTrue(formatOutput)
                          .onFalse(
                            postM4
                              .to(
                                postValidM4
                                  .onTrue(formatOutput)
                                  .onFalse(postM5.to(formatOutput)),
                              )
                              .onError(postM5),
                          ),
                      )
                      .onError(postM4),
                  ),
              )
              .onError(postM3),
          ),
      )
      .onError(postM2),
  )
