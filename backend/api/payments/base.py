"""Provider-agnostic voucher redemption interface.

IMPORTANT: this module deliberately contains no provider endpoints, credential
names, voucher formats, signatures or fee assumptions. Those must come from
official provider documentation and written merchant confirmation. Until then
every adapter raises ProviderNotConfigured.

The `ambiguous` outcome is the safety valve required for timeouts that may occur
AFTER a redemption actually succeeded: it must never be retried blindly.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Protocol, runtime_checkable


class ProviderNotConfigured(Exception):
    """Raised when a provider adapter has no verified integration details yet.

    This is the expected state for all three providers until documentation and
    written merchant confirmation exist.
    """


class ProviderError(Exception):
    """A provider call failed in a way that is safe to surface as a generic
    failure. Never include the voucher PIN in the message."""


@dataclass(frozen=True)
class RedemptionRequest:
    """Input to a redemption. `voucher_pin` is held in memory only and must
    never be logged, persisted, or returned to a client."""

    reference: str
    voucher_pin: str
    amount_expected: Decimal
    currency: str = "ZAR"


@dataclass(frozen=True)
class RedemptionResult:
    """Provider-agnostic outcome.

    outcome:
      confirmed     - provider confirmed redemption; safe to grant once
      declined      - provider definitively rejected; no grant, safe to surface
      ambiguous     - timeout/unknown AFTER a possible redemption.
                      Never retry blindly; mark needs_review and reconcile.
      needs_review  - provider returned something we cannot interpret
    """

    outcome: Literal["confirmed", "declined", "ambiguous", "needs_review"]
    provider_reference: str | None = None
    provider_event_id: str | None = None
    amount_confirmed: Decimal | None = None
    status_code: str | None = None


@runtime_checkable
class VoucherProvider(Protocol):
    """Every provider adapter implements exactly this surface."""

    name: str
    enabled: bool

    def redeem(self, request: RedemptionRequest) -> RedemptionResult:
        """Attempt a redemption. Callers must respect the outcome contract."""

    def query(self, reference: str) -> RedemptionResult | None:
        """Recovery path: look up a prior attempt by OUR reference.

        Returns None when the provider exposes no documented status lookup, in
        which case an ambiguous outcome cannot be auto-recovered and requires
        manual reconciliation.
        """


class DisabledProvider:
    """Default adapter for a provider with no verified integration details.

    Enabled-but-unimplemented is treated the same as disabled: it refuses to
    pretend a redemption happened.
    """

    def __init__(self, name: str):
        self.name = name
        self.enabled = False

    def redeem(self, request: RedemptionRequest) -> RedemptionResult:
        raise ProviderNotConfigured(
            f"{self.name} is not configured. Merchant redemption details are required."
        )

    def query(self, reference: str) -> RedemptionResult | None:
        raise ProviderNotConfigured(
            f"{self.name} is not configured. A documented status lookup is required."
        )