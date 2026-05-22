export function useCollapseBotComments() {
  return useLocalStorage('kyoto:collapse-bot-comments', true)
}
