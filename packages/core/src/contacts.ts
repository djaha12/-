/**
 * Автоскрытие контактов в публичных текстах (решение 03/7): телефоны и
 * мессенджер-ники прячутся до чата — петля доверия начинается с заявки/отклика,
 * а не со звонка мимо платформы. Применяется на ЧТЕНИИ (брифы, отклики);
 * оригинал в БД не изменяется. Цены («4 200 000 сом») и даты не трогаем.
 */

// +996 555 123 456, 996555123456, +996(555)12-34-56 — код страны + 9 цифр
const PHONE_INTL = /(?:\+|\b)996[\s\-()]*\d(?:[\s\-()]*\d){8}/g
// локальный формат: 0555 12 34 56 (10 цифр с ведущим нулём)
const PHONE_LOCAL = /(?<!\d)0\d{3}[\s\-]?\d{2,3}[\s\-]?\d{2}[\s\-]?\d{2}(?!\d)/g
// telegram/instagram-ники
const HANDLE = /@[a-z][a-z0-9_]{3,31}/gi

export const CONTACT_PLACEHOLDER = '[контакт скрыт — обсудите в чате Ателье]'

export function hideContacts(text: string): string {
  return text
    .replace(PHONE_INTL, CONTACT_PLACEHOLDER)
    .replace(PHONE_LOCAL, CONTACT_PLACEHOLDER)
    .replace(HANDLE, CONTACT_PLACEHOLDER)
}
