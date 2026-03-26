/**
 * Qwen Portal OAuth 2.0 Device Flow (RFC 8628) Implementation
 * Adapted from clawdbot_baseline for AIRI.
 */

const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai'
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`
const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56'
const QWEN_OAUTH_SCOPE = 'openid profile email model.completion'
const QWEN_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const QWEN_REFRESH_GRANT_TYPE = 'refresh_token'

export interface QwenDeviceAuthorization {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

export interface QwenOAuthToken {
  access_token: string
  refresh_token: string
  expires_at: number // Timestamp in ms
  resource_url?: string
}

export type DeviceTokenResult
  = | { status: 'success', token: QwenOAuthToken }
    | { status: 'pending', slowDown?: boolean }
    | { status: 'error', message: string }

/**
 * Generates a PKCE code verifier and challenge.
 * Uses browser-native Crypto and SubtleCrypto.
 */
export async function generatePkce(): Promise<{ verifier: string, challenge: string }> {
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const challenge = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return { verifier, challenge }
}

/**
 * Initiates the device authorization flow.
 */
export async function requestQwenDeviceCode(challenge: string): Promise<QwenDeviceAuthorization> {
  const body = new URLSearchParams({
    client_id: QWEN_OAUTH_CLIENT_ID,
    scope: QWEN_OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'x-request-id': window.crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Qwen device authorization failed: ${text || response.statusText}`)
  }

  const payload = await response.json()
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error(payload.error || 'Qwen device authorization returned incomplete payload.')
  }

  return payload as QwenDeviceAuthorization
}

/**
 * Polls the token endpoint for the access token.
 */
export async function pollQwenDeviceToken(deviceCode: string, verifier: string): Promise<DeviceTokenResult> {
  const body = new URLSearchParams({
    grant_type: QWEN_OAUTH_GRANT_TYPE,
    client_id: QWEN_OAUTH_CLIENT_ID,
    device_code: deviceCode,
    code_verifier: verifier,
  })

  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    let payload: { error?: string, error_description?: string } | undefined
    try {
      payload = await response.json()
    }
    catch {
      const text = await response.text()
      return { status: 'error', message: text || response.statusText }
    }

    if (payload?.error === 'authorization_pending') {
      return { status: 'pending' }
    }

    if (payload?.error === 'slow_down') {
      return { status: 'pending', slowDown: true }
    }

    return {
      status: 'error',
      message: payload?.error_description || payload?.error || response.statusText,
    }
  }

  const tokenPayload = await response.json()
  if (!tokenPayload.access_token || !tokenPayload.refresh_token || !tokenPayload.expires_in) {
    return { status: 'error', message: 'Qwen OAuth returned incomplete token payload.' }
  }

  return {
    status: 'success',
    token: {
      access_token: tokenPayload.access_token,
      refresh_token: tokenPayload.refresh_token,
      expires_at: Date.now() + tokenPayload.expires_in * 1000,
      resource_url: tokenPayload.resource_url,
    },
  }
}

/**
 * Refreshes an existing Qwen token.
 */
export async function refreshQwenToken(refreshToken: string): Promise<QwenOAuthToken> {
  const body = new URLSearchParams({
    grant_type: QWEN_REFRESH_GRANT_TYPE,
    client_id: QWEN_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  })

  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Qwen token refresh failed: ${text || response.statusText}`)
  }

  const tokenPayload = await response.json()
  return {
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    expires_at: Date.now() + tokenPayload.expires_in * 1000,
    resource_url: tokenPayload.resource_url,
  }
}

/**
 * High-level login helper for Qwen Portal OAuth.
 */
export async function loginQwenPortalOAuth(): Promise<{ verifier: string, deviceAuth: QwenDeviceAuthorization }> {
  const { verifier, challenge } = await generatePkce()
  const deviceAuth = await requestQwenDeviceCode(challenge)

  return { verifier, deviceAuth }
}
