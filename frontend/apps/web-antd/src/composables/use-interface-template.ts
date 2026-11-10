import { useStorage } from '@vueuse/core';

const interfaceTemplate = useStorage<'boardui' | 'vben'>('domaindeck-interface-template', 'vben');

export function useInterfaceTemplate() {
  function selectTemplate(value: string) {
    interfaceTemplate.value = value === 'boardui' ? 'boardui' : 'vben';
  }
  return { interfaceTemplate, selectTemplate };
}
