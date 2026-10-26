import { createRouter, createWebHistory } from 'vue-router'

const V = (name: string) => () => import(`./views/${name}.vue`)

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: V('HomeView') },
    { path: '/scenarios', name: 'scenarios', component: V('ScenariosView') },
    // 通用
    { path: '/ask', name: 'ask', component: V('AskView') },
    { path: '/resume', name: 'resume', component: V('ResumeView') },
    { path: '/contract', name: 'contract', component: V('ContractView') },
    { path: '/credit', name: 'credit', component: V('CreditView') },
    // 互联网
    { path: '/ugc', name: 'ugc', component: V('UgcView') },
    { path: '/abtest', name: 'abtest', component: V('AbtestView') },
    // 制造业
    { path: '/match', name: 'match', component: V('MatchView') },
    { path: '/ctp', name: 'ctp', component: V('CtpView') },
    { path: '/equipment', name: 'equipment', component: V('EquipmentView') },
    // 政务
    { path: '/gov', name: 'gov', component: V('GovView') },
    { path: '/policy', name: 'policy', component: V('PolicyView') },
    { path: '/ticket', name: 'ticket', component: V('TicketView') },
    // 审计
    { path: '/audit', name: 'audit', component: V('AuditView') },
  ],
})
