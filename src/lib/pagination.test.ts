import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { paginate, usePagination } from "@/lib/pagination"

const rows = Array.from({ length: 84 }, (_, index) => index + 1)

describe("paginate", () => {
  it("slices a page and reports the range for the header", () => {
    const page = paginate(rows, 2, 12)
    expect(page.items).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])
    expect(page.from).toBe(13)
    expect(page.to).toBe(24)
    expect(page.total).toBe(84)
    expect(page.pageCount).toBe(7)
  })

  it("clamps a page past the end back onto the last page", () => {
    expect(paginate(rows, 99, 12).page).toBe(7)
    expect(paginate(rows, 0, 12).page).toBe(1)
    expect(paginate(rows, -3, 12).page).toBe(1)
  })

  it("lands on the new last page when the list shrinks underneath", () => {
    // A job completing and ageing out while the reader sits on the last page.
    const shrunk = paginate(rows.slice(0, 72), 7, 12)
    expect(shrunk.page).toBe(6)
    expect(shrunk.items).toHaveLength(12)
  })

  it("reports a single empty page for an empty list rather than zero pages", () => {
    const page = paginate([], 1, 12)
    expect(page.pageCount).toBe(1)
    expect(page.items).toEqual([])
    expect(page.from).toBe(0)
    expect(page.to).toBe(0)
  })

  it("keeps a short list on one page so no control is drawn", () => {
    const page = paginate(rows.slice(0, 5), 1, 12)
    expect(page.pageCount).toBe(1)
    expect(page.to).toBe(5)
  })

  it("survives a nonsense page size", () => {
    expect(paginate(rows, 1, 0).items).toHaveLength(1)
  })
})

describe("usePagination", () => {
  it("stays put when a polling list is rebuilt with the same contents", () => {
    // The jobs list makes a fresh array every two seconds. Resetting on that would drag the reader
    // back to page 1 while they were still reading page 3.
    const view = renderHook(({ items }) => usePagination(items, 12, "search|All"), { initialProps: { items: [...rows] } })
    act(() => view.result.current.setPage(3))
    expect(view.result.current.page).toBe(3)
    view.rerender({ items: [...rows] })
    expect(view.result.current.page).toBe(3)
  })

  it("goes back to page 1 when the filter changes", () => {
    const view = renderHook(({ key }) => usePagination(rows, 12, key), { initialProps: { key: "|All" } })
    act(() => view.result.current.setPage(4))
    view.rerender({ key: "palworld|All" })
    expect(view.result.current.page).toBe(1)
  })

  it("shows the new last page when rows disappear underneath", () => {
    const view = renderHook(({ items }) => usePagination(items, 12, "k"), { initialProps: { items: rows } })
    act(() => view.result.current.setPage(7))
    view.rerender({ items: rows.slice(0, 60) })
    expect(view.result.current.page).toBe(5)
    expect(view.result.current.items).toHaveLength(12)
  })
})
