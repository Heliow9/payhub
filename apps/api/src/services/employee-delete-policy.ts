export function employeeDeletionBlockReason(statuses:Array<string|null|undefined>):string|null{
  return statuses.some((status)=>String(status??'').toUpperCase()==='SIGNED')
    ? 'Funcionário possui holerite assinado e não pode ser excluído.'
    : null;
}
