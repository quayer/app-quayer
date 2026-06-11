import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchWithAuthRetry } from "./client-refresh"

describe("fetchWithAuthRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the first response when it is not unauthorized", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await fetchWithAuthRetry("/api/v1/builder/test")

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refreshes the session and retries once after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response("refreshed", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await fetchWithAuthRetry("/api/v1/builder/test")

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/builder/test",
      expect.objectContaining({ credentials: "same-origin" }),
    )
  })

  it("returns the original 401 when refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(new Response("invalid refresh", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await fetchWithAuthRetry("/api/v1/builder/test")

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
