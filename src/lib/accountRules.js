export const EMAIL_DOMAIN = '@towngaz.com'

// Takes what was typed ("juan" or "juan@towngaz.com") and returns { email } or { error }
export function buildEmail(input) {
  const text = String(input).trim().toLowerCase()
  if (!text) return { error: 'Please enter your email' }

  let name = text
  if (text.includes('@')) {
    if (!text.endsWith(EMAIL_DOMAIN)) {
      return { error: `Email must end with ${EMAIL_DOMAIN}, for example name${EMAIL_DOMAIN}` }
    }
    name = text.slice(0, -EMAIL_DOMAIN.length)
  }

  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(name)) {
    return {
      error:
        'The part before @ can only have letters, numbers, dots, dashes, and underscores, and must start and end with a letter or number',
    }
  }
  return { email: name + EMAIL_DOMAIN }
}

// Returns an error message, or '' when the password is fine
export function passwordError(password) {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/^[A-Za-z0-9]+$/.test(password)) {
    return 'Password can only have letters and numbers (no spaces, signs, or symbols)'
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must have both letters and numbers'
  }
  return ''
}

// ---- Name: letters (including Ñ and accents) and single spaces only ----

// used while typing: removes anything that is not a letter or a space
export const filterName = (text) =>
  text.replace(/[^\p{L} ]/gu, '').replace(/ {2,}/g, ' ').replace(/^ /, '')

// returns an error message, or '' when the name is fine
export function nameError(name) {
  const text = name.trim()
  if (text.length < 2) return 'Please enter your full name'
  if (!/^\p{L}+( \p{L}+)*$/u.test(text)) return 'Name can only have letters and spaces'
  return ''
}

// ---- Contact number: exactly 11 digits ----

// used while typing: keeps digits only, at most 11
export const filterContact = (text) => text.replace(/\D/g, '').slice(0, 11)

export const contactError = (contact) =>
  /^\d{11}$/.test(contact) ? '' : 'Contact number must be exactly 11 digits'