from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class ProviderPagination(PageNumberPagination):
    """Reproduce the provider's list envelope so existing screens keep working."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            "errors": [],
            "results": len(data),
            "paging": {"current": self.page.number, "total": self.page.paginator.num_pages},
            "response": data,
        })