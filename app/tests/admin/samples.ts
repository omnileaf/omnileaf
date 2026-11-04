export const REPLY_ADDRESS = "reporter-reply@example.test";

export const CODES = {
  received: "R-8M4T-K2QX",
  reviewing: "R-3H7W-P9ZD",
  published: "R-0A5C-J6VN",
  otherPublished: "R-1B2D-F4GH",
  duplicate: "R-5K6M-N8PQ",
  closed: "R-7E9S-M3TY",
} as const;
export const UNKNOWN_CODE = "R-2222-2222";
export const MALFORMED_CODE = "not-a-code";
export const REPORT_COUNT = Object.keys(CODES).length;

export const RECEIVED_TEXT =
  "The reader shows a blank page after I rotate the phone.\n\nSteps:\n1. Open any book\n2. Rotate the phone twice";
export const ISSUE_TEXT_START = "**Report R-8M4T-K2QX**";
export const HOSTILE_TEXT = '<img src=x onerror="alert(1)"><b>x</b>';
