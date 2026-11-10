import { useStorage } from '@vueuse/core';

export type InterfaceTemplate = 'boardui' | 'pro' | 'vben';

const interfaceTemplate = useStorage<InterfaceTemplate>('domaindeck-interface-template', 'vben');

export function useInterfaceTemplate() {
  function selectTemplate(value: string) {
    interfaceTemplate.value = value === 'boardui' || value === 'pro' ? value : 'vben';
  }
  return { interfaceTemplate, selectTemplate };
}
