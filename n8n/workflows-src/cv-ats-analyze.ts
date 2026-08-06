import { workflow, node, trigger, expr } from '@n8n/workflow-sdk'

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'CV Analyze Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'cv-analyze',
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
          { id: 'cv-text', name: 'cvText', value: expr('{{ $json.body?.cvText ?? $json.cvText ?? "" }}'), type: 'string' },
          { id: 'jd', name: 'targetJobDescription', value: expr('{{ $json.body?.targetJobDescription ?? $json.targetJobDescription ?? "" }}'), type: 'string' },
        ],
      },
    },
  },
})

const analyzeSystemPrompt =
  'Kamu adalah penilai ATS (Applicant Tracking System) untuk CV. ' +
  'Analisis kecocokan CV terhadap deskripsi pekerjaan (JD). ' +
  'Kembalikan HANYA JSON tanpa markdown code fence dengan format: ' +
  '{"overallScore": number 0-100, "atsChecks": [{"id": string, "name": string, "status": "pass"|"warn"|"fail", "score": number, "detail": string}], "weaknesses": [string], "suggestions": [{"id": string, "title": string, "description": string, "category": string, "priority": "high"|"medium"|"low"}]}. ' +
  'id atsChecks: keyword, skills, sections, formatting, quantified, readability. ' +
  'Gunakan bahasa Indonesia untuk semua teks.'

const analyzeM1 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Analyze - Model 1',
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
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const analyzeM2 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Analyze - Model 2',
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
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 120000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const analyzeM3 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Analyze - Model 3',
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
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
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
          { id: 'model', name: 'model', value: expr('{{ $json.model }}'), type: 'string' },
          { id: 'raw', name: 'raw', value: expr('{{ $json.choices?.[0]?.message?.content ?? "" }}'), type: 'string' },
        ],
      },
    },
  },
})

export default workflow('cv-ats-analyze', 'CV ATS Analyze')
  .add(webhook)
  .to(normalizeInput)
  .to(
    analyzeM1
      .to(formatOutput)
      .onError(analyzeM2.to(formatOutput).onError(analyzeM3.to(formatOutput))),
  )
