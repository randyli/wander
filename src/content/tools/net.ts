export interface FetchResult {
  ok: boolean
  status: number
  body: string
}

export async function netFetch({
  url,
  options = {},
}: {
  url: string
  options?: RequestInit
}): Promise<FetchResult> {
  const response = await fetch(url, options)
  const body = await response.text()
  return { ok: response.ok, status: response.status, body }
}
