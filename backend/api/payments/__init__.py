"""Voucher provider adapters.

Each provider is a SEPARATE adapter with its own configuration and enable flag.
All adapters default to disabled. No provider HTTP details are implemented here
because no official merchant redemption documentation has been supplied; each
adapter raises ProviderNotConfigured until real details are available.

See `base.py` for the interface every provider must satisfy.
"""