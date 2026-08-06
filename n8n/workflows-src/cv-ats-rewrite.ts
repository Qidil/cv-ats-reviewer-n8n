import { workflow, node, trigger, expr } from '@n8n/workflow-sdk'

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
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($json.approvedSuggestions) }}') },
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
        model: 'openai/gpt-oss-120b:free',
        messages: [
          { role: 'system', content: rewriteSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($json.approvedSuggestions) }}') },
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
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nDeskripsi pekerjaan (JD):\n{{ $json.targetJobDescription }}\n\nSaran yang disetujui:\n{{ JSON.stringify($json.approvedSuggestions) }}') },
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
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $json.raw }}\n\nDeskripsi pekerjaan:\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 1024,
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
        model: 'openai/gpt-oss-120b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $json.raw }}\n\nDeskripsi pekerjaan:\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 1024,
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
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          { role: 'system', content: postCheckSystemPrompt },
          { role: 'user', content: expr('CV asli:\n{{ $json.originalCv }}\n\nCV hasil tulis ulang:\n{{ $json.raw }}\n\nDeskripsi pekerjaan:\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
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
      .to(captureRewrite)
      .onError(rewriteM2.to(captureRewrite).onError(rewriteM3.to(captureRewrite))),
  )
  .add(captureRewrite)
  .to(
    postM1
      .to(formatOutput)
      .onError(postM2.to(formatOutput).onError(postM3.to(formatOutput))),
  )
