// Mensagem amigável ÚNICA para qualquer falha de sistema/back-end exibida ao
// usuário. A causa técnica real deve ir sempre para console.error — NUNCA para a
// UI. Pensada para o lançamento: o usuário nunca vê o erro "certinho".
export const FRIENDLY_ERROR =
  "Não consegui concluir esta ação agora. Tente novamente em instantes — se o problema continuar, fale com o T4 ou o Xitter.";
