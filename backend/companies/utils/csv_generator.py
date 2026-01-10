"""
CSV Generator Utility
Handles streaming CSV generation with proper encoding
"""
import csv
from io import StringIO
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class CSVGenerator:
    """
    Streaming CSV generator for efficient export of large datasets.

    Uses StringIO buffer to generate CSV rows without loading all data into memory.
    Supports UTF-8 encoding with BOM for Excel compatibility.
    """

    def __init__(self, headers: List[str], delimiter=';', quoting=csv.QUOTE_MINIMAL):
        """
        Initialize CSV generator.

        Args:
            headers: List of column headers
            delimiter: CSV delimiter (default: comma)
            quoting: CSV quoting strategy (default: QUOTE_MINIMAL)
        """
        self.headers = headers
        self.delimiter = delimiter
        self.quoting = quoting

        self._writer_kwargs = {
            'fieldnames': headers,
            'delimiter': delimiter,
            'quoting': quoting,
            'extrasaction': 'ignore'
        }

    def write_header(self) -> str:
        """
        Write CSV header row.

        Returns:
            String containing CSV header row
        """
        buffer = StringIO()
        writer = csv.DictWriter(buffer, **self._writer_kwargs)
        writer.writeheader()
        return buffer.getvalue()

    def write_row(self, data: Dict) -> str:
        """
        Write single CSV row.

        Args:
            data: Dictionary with row data (keys matching headers)

        Returns:
            String containing CSV row
        """
        buffer = StringIO()
        writer = csv.DictWriter(buffer, **self._writer_kwargs)

        row = {header: self._format_value(data.get(header, '')) for header in self.headers}

        writer.writerow(row)
        return buffer.getvalue()

    def _format_value(self, value) -> str:
        """
        Format value for CSV output.

        Handles:
        - None -> empty string
        - Boolean -> Yes/No
        - Lists -> comma-separated
        - Other types -> string conversion
        """
        if value is None:
            return ''

        if isinstance(value, bool):
            return 'Yes' if value else 'No'

        if isinstance(value, (list, tuple)):
            return ', '.join(str(v) for v in value)

        return str(value)
