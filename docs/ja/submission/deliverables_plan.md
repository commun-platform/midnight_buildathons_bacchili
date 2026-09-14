# Wave 1 Repository Review Plan

[English](../../submission/deliverables_plan.md)

Repository Reviewでは、Product Claim、実装、限界、再現可能なCheckを追いやすくします。Review Baselineは
Commit `b72efb7d4df8384a9e8dd873b8e3a65f6e9e5fbd` です。

## Review Requirements

| Requirement | Repository Evidence | Completion Gate |
| --- | --- | --- |
| Public GitHub Repository | Root README、Apache 2.0 License、Repository Topic | 提出時にPublicで `midnightntwrk` Topicがある |
| Clear Project Explanation | [Top README](../../../README.md)、[Submission Copy](submission_copy.md)、[One-page Brief](one_page_brief.md) | Value、Architecture、Setup、Midnight Integration、Limitations、Evaluation Pathを明記 |
| Meaningful Midnight Functionality | [Compact Contract](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact)、Witness、Transaction Agent、Public Verifier | 固定ToolchainでCompileし、拒否系CaseがPass |
| Quality / Reliability | Workspace Test、Portability Check、Source Gate | Clean Checkoutで `npm ci && npm run verify:source` が成功 |
| 日付付きDeployment Evidence | [Release Addendum](current_release_addendum.md)、[Evidence Matrix](evidence_matrix.md) | 日付とClaim境界付きPublic Transaction Record |
| Honest Roadmap | [Wave 1 Progress](wave1_progress.md)、[Three-wave Roadmap](../../architecture/three_wave_roadmap.md) | 計画と実装済み動作を分離 |

## Rubric Mapping

| Category | Weight | Primary Repository Evidence |
| --- | ---: | --- |
| Engineering & Implementation | 40% | 8回路Compile、Privacy境界、認可済みDevice / Managed Transaction、Public / Private MCP Worker分離 |
| Quality Assurance & Reliability | 15% | Source Test、Tamper Rejection、固定24 Slot、Retry / Idempotency、再現可能Source Gate |
| Product & Vision | 15% | Privacy課題、Target User、Exact Claim、Roadmap |
| User Experience & Design | 15% | Operator Workflow、Public Verifier、明示的State、Frontend SourceのEvidence境界 |
| Communication | 10% | Focused README、1ページ概要、Architecture Diagram、Claim Matrix、Judge Q&A |
| Business Development & Viability | 5% | Construction Measurementの入口、Partner Pilot計画、段階的Adoption Model |

## Evidence Path

1. [1ページ概要](one_page_brief.md)でCustomer ValueとExact Claimを確認する。
2. [Evidence Matrix](evidence_matrix.md)から各ClaimのSourceと拒否系Testへ進む。
3. [Compact Contract](../../../midnight/contracts/sensor-registry/src/sensor-registry.compact)、[Witness](../../../midnight/contracts/sensor-registry/src/witnesses.ts)、[Public Verifier](../../../shared/public-attestation-verifier/src/index.ts)を確認する。
4. Source Gateを実行し、[Technical Checklist](technical_gate_checklist.md)と結果を比較する。
5. 日付付きPublic Recordと限界は[Release Addendum](current_release_addendum.md)で確認する。

## Evidence Policy

Repository Review Evidenceは、追跡対象File、再現可能なCommand結果、Public URLだけで構成します。再現もLinkもできないClaimはOpenとして扱います。
