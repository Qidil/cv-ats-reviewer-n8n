import { workflow, node, trigger, expr, ifElse } from '@n8n/workflow-sdk'

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
          { role: 'user', content: expr('CV:\n{{ $("Normalize Input").item.json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 60000 },
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
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $("Normalize Input").item.json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 60000 },
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
          { role: 'user', content: expr('CV:\n{{ $("Normalize Input").item.json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 60000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

const analyzeM4 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Analyze - Model 4',
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
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $("Normalize Input").item.json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 60000 },
    },
    onError: 'continueErrorOutput',
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

// tradeoff (CR-18 INFO): Model 5 adalah model terakhir — tanpa If-node validasi.
// Jika seluruh rantai gagal, error Model 5 mengalir ke Format Output (raw kosong)
// dan backend melaporkan error kontrak generik. Diterima sebagai desain last-resort.
const analyzeM5 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Analyze - Model 5',
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
          { role: 'system', content: analyzeSystemPrompt },
          { role: 'user', content: expr('CV:\n{{ $("Normalize Input").item.json.cvText }}\n\nDeskripsi Pekerjaan (JD):\n{{ $("Normalize Input").item.json.targetJobDescription }}') },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      },
      options: { timeout: 60000 },
    },
    onError: 'continueErrorOutput',
    // CR-24 INFO: credential ID di bawah terikat ke instance n8n lokal (id dari
    // credential store). Saat import ke instance lain, konek ulang kredensial
    // OpenRouter di setiap node HTTP (lihat README).
    credentials: { openRouterApi: { id: 'DNXYjrGmURVEVg05', name: 'OpenRouter account' } },
  },
})

// Catatan (CR-08): blok validasi di bawah sengaja diduplikasi per model, karena
// parser n8n Workflow SDK menolak function/arrow function — satu-satunya cara
// valid adalah deklarasi ifElse inline per model (kendala DSL deklaratif SDK).

const analyzeValidM1 = ifElse({
  version: 2.3,
  config: {
    name: 'Analyze Valid Model 1',
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

const analyzeValidM2 = ifElse({
  version: 2.3,
  config: {
    name: 'Analyze Valid Model 2',
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

const analyzeValidM3 = ifElse({
  version: 2.3,
  config: {
    name: 'Analyze Valid Model 3',
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

const analyzeValidM4 = ifElse({
  version: 2.3,
  config: {
    name: 'Analyze Valid Model 4',
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
      .to(
        analyzeValidM1
          .onTrue(formatOutput)
          .onFalse(
            analyzeM2
              .to(
                analyzeValidM2
                  .onTrue(formatOutput)
                  .onFalse(
                    analyzeM3
                      .to(
                        analyzeValidM3
                          .onTrue(formatOutput)
                          .onFalse(
                            analyzeM4
                              .to(
                                analyzeValidM4
                                  .onTrue(formatOutput)
                                  .onFalse(analyzeM5.to(formatOutput)),
                              )
                              .onError(analyzeM5),
                          ),
                      )
                      .onError(analyzeM4),
                  ),
              )
              .onError(analyzeM3),
          ),
      )
      .onError(analyzeM2),
  )
