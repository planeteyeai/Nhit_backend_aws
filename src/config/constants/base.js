/**
 * Converted from PHP constants.php (CodeIgniter-style)
 * Use in React: import { SHOW_DEBUG_BACKTRACE, EXIT_SUCCESS, MONTHS } from './constants/base';
 */

export const SHOW_DEBUG_BACKTRACE = true;

export const FILE_READ_MODE = 0o644;
export const FILE_WRITE_MODE = 0o666;
export const DIR_READ_MODE = 0o755;
export const DIR_WRITE_MODE = 0o755;

export const FOPEN_READ = 'rb';
export const FOPEN_READ_WRITE = 'r+b';
export const FOPEN_WRITE_CREATE_DESTRUCTIVE = 'wb';
export const FOPEN_READ_WRITE_CREATE_DESTRUCTIVE = 'w+b';
export const FOPEN_WRITE_CREATE = 'ab';
export const FOPEN_READ_WRITE_CREATE = 'a+b';
export const FOPEN_WRITE_CREATE_STRICT = 'xb';
export const FOPEN_READ_WRITE_CREATE_STRICT = 'x+b';

export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFIG = 3;
export const EXIT_UNKNOWN_FILE = 4;
export const EXIT_UNKNOWN_CLASS = 5;
export const EXIT_UNKNOWN_METHOD = 6;
export const EXIT_USER_INPUT = 7;
export const EXIT_DATABASE = 8;
export const EXIT__AUTO_MIN = 9;
export const EXIT__AUTO_MAX = 125;

export const EXPIRY_DAYS = 365;

export const MONTHS = {
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
  1: 'January',
  2: 'February',
  3: 'March',
};

export const NEXT_MONTHS = ['January', 'February', 'March'];
