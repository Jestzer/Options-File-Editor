#!/usr/bin/env python3
"""
Anonymize MathWorks FlexNet license files and options files for safe sharing.

Usage:
    python anonymize.py license.lic options.opt   # Both (recommended)
    python anonymize.py license.lic               # License file only
    python anonymize.py options.opt               # Options file only

Outputs anonymized files as <filename>.anonymized.<ext> in the same directory.
"""

import re
import sys
import os


class AnonymizationMap:
    """Maintains consistent mappings for each category of sensitive data."""

    def __init__(self):
        self._maps = {}
        self._counters = {}

    def get(self, category, prefix, original):
        """Return the anonymized value for `original` in `category`.

        On first lookup, assigns a new sequential value (e.g., user1, user2).
        Subsequent lookups return the same value.
        """
        if category not in self._maps:
            self._maps[category] = {}
            self._counters[category] = 0

        if original not in self._maps[category]:
            self._counters[category] += 1
            self._maps[category][original] = f"{prefix}{self._counters[category]}"

        return self._maps[category][original]

    def get_numeric(self, category, start, original):
        """Return a numeric anonymized value (e.g., 100001, 100002)."""
        if category not in self._maps:
            self._maps[category] = {}
            self._counters[category] = 0

        if original not in self._maps[category]:
            self._counters[category] += 1
            self._maps[category][original] = str(start + self._counters[category])

        return self._maps[category][original]


def detect_file_type(text):
    """Detect whether the text is a license file or an options file."""
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("INCREMENT "):
            return "license"

    options_keywords = [
        "INCLUDE ", "EXCLUDE ", "INCLUDEALL ", "EXCLUDEALL ",
        "INCLUDE_BORROW ", "EXCLUDE_BORROW ",
        "RESERVE ", "MAX ", "GROUP ", "HOST_GROUP ",
        "GROUPCASEINSENSITIVE", "USERCASEINSENSITIVE",
    ]
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        for keyword in options_keywords:
            if stripped.startswith(keyword):
                return "options"

    return None


def anonymize_license_file(text, mapping):
    """Anonymize a license file, returning the anonymized text."""
    # Join continuation lines for processing, then split back.
    # We process line-by-line on the raw text to preserve formatting.
    lines = text.split("\n")
    result = []

    in_sign_block = False

    for line in lines:
        stripped = line.strip()

        # Strip comment content.
        if stripped.startswith("#"):
            result.append("# [comment omitted to ensure anonymization]")
            continue

        anonymized = line

        # Signature: SIGN="..." — zero out hex content. May span multiple
        # continuation lines, so track whether we're inside a SIGN block.
        if in_sign_block:
            anonymized = re.sub(r'[0-9A-Fa-f]', '0', anonymized)
            if '"' in line:
                in_sign_block = False
        elif 'SIGN="' in anonymized:
            if anonymized.count('"') >= 2 and re.search(r'SIGN="[^"]*"', anonymized):
                # Single-line SIGN — replace in place.
                anonymized = re.sub(
                    r'SIGN="([^"]*)"',
                    lambda m: 'SIGN="' + re.sub(r'[0-9A-Fa-f]', '0', m.group(1)) + '"',
                    anonymized,
                )
            else:
                # Multi-line SIGN — zero out from SIGN=" to end of line.
                idx = anonymized.index('SIGN="')
                before = anonymized[:idx]
                after = anonymized[idx:]
                anonymized = before + re.sub(r'[0-9A-Fa-f]', '0', after)
                in_sign_block = True

        # Product key: 7th token on INCREMENT lines (index 6).
        # INCREMENT ProductName MLM version expiry seats PRODUCTKEY ...
        if anonymized.lstrip().startswith("INCREMENT"):
            parts = anonymized.split()
            if len(parts) >= 7:
                original_key = parts[6]
                # Only replace if it looks like a product key (10-20 alphanumeric chars).
                if 10 <= len(original_key) <= 20 and original_key.isalnum():
                    anon_key = mapping.get("product_keys", "ABCDEF", original_key)
                    # Pad to match original length.
                    anon_key = anon_key.ljust(len(original_key), "0")[:len(original_key)]
                    anonymized = anonymized.replace(original_key, anon_key, 1)

        # Entitlement ID: ei=DIGITS inside VENDOR_STRING.
        anonymized = re.sub(
            r'\bei=(\d+)',
            lambda m: "ei=" + mapping.get_numeric("entitlement_ids", 1000000, m.group(1)),
            anonymized,
        )

        # License number / asset_info (skip DEMO).
        def replace_asset_info(m):
            value = m.group(1)
            if value.upper() == "DEMO":
                return m.group(0)
            return "asset_info=" + mapping.get_numeric("license_numbers", 100000, value)

        anonymized = re.sub(r'asset_info=(\S+)', replace_asset_info, anonymized)

        # SN= (same mapping as license numbers).
        def replace_sn(m):
            value = m.group(1)
            if value.upper() == "DEMO":
                return m.group(0)
            return "SN=" + mapping.get_numeric("license_numbers", 100000, value)

        anonymized = re.sub(r'\bSN=(\S+)', replace_sn, anonymized)

        result.append(anonymized)

    return "\n".join(result)


def anonymize_options_file(text, mapping):
    """Anonymize an options file, returning the anonymized text."""
    lines = text.split("\n")
    result = []

    recognized_keywords = {
        "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
        "INCLUDEALL", "EXCLUDEALL", "RESERVE", "MAX",
        "GROUP", "HOST_GROUP",
        "GROUPCASEINSENSITIVE", "USERCASEINSENSITIVE",
        "TIMEOUT", "LINGER", "BORROW", "NOLOG", "DEBUGLOG", "REPORTLOG",
        "AUTOMATIC_REREAD", "TIMEOUTALL",
    }

    for line in lines:
        stripped = line.strip()

        # Keep empty lines.
        if not stripped:
            result.append(line)
            continue

        # Strip comment content.
        if stripped.startswith("#"):
            result.append("# [comment omitted to ensure anonymization]")
            continue

        # Determine the directive type.
        first_word = stripped.split()[0].upper() if stripped.split() else ""

        if first_word in ("GROUP", "HOST_GROUP"):
            result.append(_anonymize_group_line(line, first_word, mapping))
        elif first_word in (
            "INCLUDE", "EXCLUDE", "INCLUDE_BORROW", "EXCLUDE_BORROW",
            "RESERVE", "MAX",
        ):
            anonymized = _anonymize_product_directive(line, mapping)
            if anonymized is not None:
                result.append(anonymized)
            else:
                result.append("# [unrecognized line removed during anonymization]")
        elif first_word in ("INCLUDEALL", "EXCLUDEALL"):
            result.append(_anonymize_all_directive(line, mapping))
        elif first_word in recognized_keywords:
            result.append(line)
        else:
            result.append("# [unrecognized line removed during anonymization]")

    return "\n".join(result)


def _anonymize_group_line(line, group_type, mapping):
    """Anonymize a GROUP or HOST_GROUP line."""
    parts = line.split()
    if len(parts) < 2:
        return line

    # parts[0] = GROUP/HOST_GROUP, parts[1] = name, parts[2:] = members.
    directive = parts[0]

    if group_type == "HOST_GROUP":
        name_category = "host_group_names"
        name_prefix = "host_group"
        member_category = "host_group_members"
        member_prefix = "host"
    else:
        name_category = "group_names"
        name_prefix = "group"
        member_category = "usernames"
        member_prefix = "user"

    anon_name = mapping.get(name_category, name_prefix, parts[1])
    anon_members = []
    for member in parts[2:]:
        clean = member.strip('"')
        if clean:
            anon = mapping.get(member_category, member_prefix, clean)
            # Preserve quotes if original had them.
            if member.startswith('"') or member.endswith('"'):
                anon = f'"{anon}"'
            anon_members.append(anon)

    return f"{directive} {anon_name} {' '.join(anon_members)}"


VALID_CLIENT_TYPES = {"USER", "GROUP", "HOST", "HOST_GROUP", "DISPLAY", "PROJECT", "INTERNET"}


def _anonymize_product_directive(line, mapping):
    """Anonymize an INCLUDE/EXCLUDE/RESERVE/MAX directive line.

    Returns None if the line can't be parsed (e.g., spaced product name).
    """
    parts = line.split()
    if len(parts) < 3:
        return None

    result_parts = [parts[0]]  # Directive type.
    i = 1

    # RESERVE and MAX have a seat count before the product.
    if parts[0].upper() in ("RESERVE", "MAX"):
        result_parts.append(parts[1])  # Seat count.
        i = 2

    if i >= len(parts):
        return line

    # Product field — may be quoted with asset_info, or have :key= qualifier.
    product_part = parts[i]

    if product_part.startswith('"'):
        # Quoted product: "ProductName asset_info=NNNN" or "ProductName key=XXXX"
        # Gather the full quoted string.
        quoted = []
        while i < len(parts):
            quoted.append(parts[i])
            if parts[i].endswith('"'):
                break
            i += 1
        quoted_str = " ".join(quoted)

        # Anonymize asset_info inside the quoted string.
        def replace_asset(m):
            val = m.group(1)
            if val.upper() == "DEMO":
                return m.group(0)
            return "asset_info=" + mapping.get_numeric("license_numbers", 100000, val)

        quoted_str = re.sub(r'asset_info=(\S+?)(?=["\s]|$)', replace_asset, quoted_str)
        result_parts.append(quoted_str)
    elif ":" in product_part:
        # Product:key=XXXX or Product:asset_info=NNNN
        colon_idx = product_part.index(":")
        product_name = product_part[:colon_idx]
        qualifier = product_part[colon_idx + 1:]

        if qualifier.startswith("key="):
            original_key = qualifier[4:]
            anon_key = mapping.get("product_keys", "ABCDEF", original_key)
            anon_key = anon_key.ljust(len(original_key), "0")[:len(original_key)]
            result_parts.append(f"{product_name}:key={anon_key}")
        elif qualifier.startswith("asset_info="):
            original_num = qualifier[11:]
            if original_num.upper() != "DEMO":
                anon_num = mapping.get_numeric("license_numbers", 100000, original_num)
                result_parts.append(f"{product_name}:asset_info={anon_num}")
            else:
                result_parts.append(product_part)
        else:
            result_parts.append(product_part)
    else:
        # Plain product name.
        result_parts.append(product_part)

    i += 1

    # Client type and client specified.
    if i < len(parts):
        client_type = parts[i]
        if client_type.upper() not in VALID_CLIENT_TYPES:
            return None
        result_parts.append(client_type)
        i += 1

        # Anonymize the client value based on client type.
        if i < len(parts):
            client_value = " ".join(parts[i:])
            # Strip surrounding quotes for mapping, re-add if needed.
            has_quotes = client_value.startswith('"') and client_value.endswith('"')
            clean_value = client_value.strip('"')

            upper_ct = client_type.upper()
            if upper_ct == "USER":
                anon = mapping.get("usernames", "user", clean_value)
            elif upper_ct == "GROUP":
                anon = mapping.get("group_names", "group", clean_value)
            elif upper_ct == "HOST_GROUP":
                anon = mapping.get("host_group_names", "host_group", clean_value)
            else:
                anon = clean_value

            if has_quotes:
                anon = f'"{anon}"'
            result_parts.append(anon)

    return " ".join(result_parts)


def _anonymize_all_directive(line, mapping):
    """Anonymize an INCLUDEALL/EXCLUDEALL directive line."""
    parts = line.split()
    if len(parts) < 3:
        return line

    result_parts = [parts[0], parts[1]]  # Directive + client type.

    client_value = " ".join(parts[2:])
    has_quotes = client_value.startswith('"') and client_value.endswith('"')
    clean_value = client_value.strip('"')

    upper_ct = parts[1].upper()
    if upper_ct == "USER":
        anon = mapping.get("usernames", "user", clean_value)
    elif upper_ct == "GROUP":
        anon = mapping.get("group_names", "group", clean_value)
    elif upper_ct == "HOST_GROUP":
        anon = mapping.get("host_group_names", "host_group", clean_value)
    else:
        anon = clean_value

    if has_quotes:
        anon = f'"{anon}"'
    result_parts.append(anon)

    return " ".join(result_parts)


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip())
        sys.exit(1)

    files = sys.argv[1:]
    if len(files) > 2:
        print("Error: provide at most 2 files (one license file and one options file).")
        sys.exit(1)

    # Read and classify files.
    file_data = []
    for path in files:
        if not os.path.isfile(path):
            print(f"Error: '{path}' not found.")
            sys.exit(1)
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        file_type = detect_file_type(text)
        if file_type is None:
            print(f"Error: could not detect file type for '{path}'.")
            sys.exit(1)
        file_data.append({"path": path, "text": text, "type": file_type})

    # Validate: no duplicate types.
    types = [fd["type"] for fd in file_data]
    if len(types) == 2 and types[0] == types[1]:
        print(f"Error: both files were detected as {types[0]} files. Provide one of each type.")
        sys.exit(1)

    # Recommend providing both.
    if len(file_data) == 1:
        other = "options" if file_data[0]["type"] == "license" else "license"
        print(f"Note: for consistent anonymization, consider providing the {other} file as well.")
        print()

    # Sort so license file is processed first.
    file_data.sort(key=lambda fd: 0 if fd["type"] == "license" else 1)

    mapping = AnonymizationMap()

    for fd in file_data:
        if fd["type"] == "license":
            anonymized = anonymize_license_file(fd["text"], mapping)
        else:
            anonymized = anonymize_options_file(fd["text"], mapping)

        # Write output.
        base, ext = os.path.splitext(fd["path"])
        out_path = f"{base}.anonymized{ext}"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(anonymized)
        print(f"Anonymized {fd['type']} file: {out_path}")


if __name__ == "__main__":
    main()
