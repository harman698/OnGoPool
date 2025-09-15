// Currency utility functions for Canadian Dollar (CAD) formatting

/**
 * Format currency amount in Canadian Dollar (CAD) format
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "CAD $25.50")
 */
export const formatCurrency = (
  amount: number,
  options: {
    currency?: string;
    showSymbol?: boolean;
    precision?: number;
  } = {}
): string => {
  const { currency = 'CAD', showSymbol = true, precision = 2 } = options;
  
  // Round to specified precision
  const roundedAmount = Math.round(amount * Math.pow(10, precision)) / Math.pow(10, precision);
  
  if (showSymbol) {
    return `${currency} $${roundedAmount.toFixed(precision)}`;
  }
  
  return roundedAmount.toFixed(precision);
};

/**
 * Parse currency string to number
 * @param currencyString - Currency string like "CAD $25.50" or "$25.50"
 * @returns Numeric amount or null if invalid
 */
export const parseCurrency = (currencyString: string): number | null => {
  if (!currencyString || typeof currencyString !== 'string') {
    return null;
  }
  
  // Remove currency symbols and letters, keep numbers and decimal point
  const cleanString = currencyString.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleanString);
  
  return isNaN(parsed) ? null : parsed;
};

/**
 * Format amount for display in payment contexts
 * @param amount - The amount to format
 * @returns Formatted string suitable for payment UI
 */
export const formatPaymentAmount = (amount: number): string => {
  return formatCurrency(amount, { showSymbol: true, precision: 2 });
};

/**
 * Format amount for database storage (as string with 2 decimal places)
 * @param amount - The amount to format
 * @returns String representation with 2 decimal places
 */
export const formatForDatabase = (amount: number): string => {
  return formatCurrency(amount, { showSymbol: false, precision: 2 });
};

/**
 * Get the default currency for the application
 * @returns Currency code (CAD)
 */
export const getDefaultCurrency = (): string => {
  return 'CAD';
};

/**
 * Format earnings display with CAD currency
 * @param amount - Earnings amount
 * @returns Formatted earnings string
 */
export const formatEarnings = (amount: number): string => {
  return formatCurrency(amount, { showSymbol: true, precision: 2 });
};

/**
 * Format payout amount display with CAD currency
 * @param amount - Payout amount
 * @returns Formatted payout string
 */
export const formatPayout = (amount: number): string => {
  return formatCurrency(amount, { showSymbol: true, precision: 2 });
};