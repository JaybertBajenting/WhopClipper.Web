import { useCallback, useMemo, useState } from "react"

export interface Page<T> {
  items: T[]
  /** The page actually shown, which is not always the one asked for. See below. */
  page: number
  pageCount: number
  total: number
  /** 1-based index of the first and last item on this page; both 0 for an empty list. */
  from: number
  to: number
}

/**
 * Slices a list into a page, clamping the page number into range rather than trusting it.
 *
 * The clamping is the point. Lists here move under the reader: the jobs list refetches every two
 * seconds, and a completed job aging out while you sit on the last page must land you on the new
 * last page, never on a blank one.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize))
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return {
    items: slice,
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
  }
}

/**
 * Page state for a list that is already filtered. Pass the filtered array, not the raw one: pages
 * are pages of results, so searching narrows the whole list and then re-pages it, rather than
 * searching only whatever happened to be on screen.
 *
 * `resetKey` is what sends the reader back to page 1 - the search text and filters, joined. It is
 * explicit rather than derived from `items` because these lists poll: the jobs list rebuilds its
 * array every two seconds while a render's progress ticks, and resetting on that would drag the
 * reader off whatever page they were reading, over and over.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey = "") {
  const [state, setState] = useState({ page: 1, key: resetKey })
  // Derived, not synchronised. A stored page belongs to the filter it was chosen under, so once
  // the key moves on it simply stops counting and page 1 is what shows - no effect, no extra
  // render pass, and no window in which the rows and the controls disagree. Clamping to a list
  // that shrank is already `paginate`'s job.
  const page = state.key === resetKey ? state.page : 1
  const result = useMemo(() => paginate(items, page, pageSize), [items, page, pageSize])
  const setPage = useCallback((next: number) => setState({ page: next, key: resetKey }), [resetKey])
  return { ...result, setPage }
}
