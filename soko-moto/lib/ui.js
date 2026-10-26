export function formatKsh(value){return new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(value)||0)}
export function errorText(error){return error?.message || 'Something went wrong. Please try again.'}
