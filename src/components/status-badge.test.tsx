import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CampaignStatusBadge, JobStatusBadge } from "@/components/status-badge"

describe("status badges", () => {
  it("humanizes campaign review state", () => {
    render(<CampaignStatusBadge status="NeedsReview" />)
    expect(screen.getByText("Needs review")).toBeInTheDocument()
  })

  it("communicates failed background work", () => {
    render(<JobStatusBadge status="Failed" />)
    expect(screen.getByText("Failed")).toBeInTheDocument()
  })
})
