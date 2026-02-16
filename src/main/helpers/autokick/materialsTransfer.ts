/**
 * AutoKick Materials Transfer Helper
 * Transfiere materiales del almacenamiento al inventario
 */

import { composeMCP } from '../../utils/mcp';

interface MaterialInfo {
  name: string;
  guid: string;
  quantity: number;
  templateId: string;
}

interface TransferOperation {
  itemId: string;
  quantity: number;
  toStorage: boolean;
  newItemIdHint: string;
}

/**
 * Extrae materiales del perfil theater0
 */
function extractMaterialsFromProfile(items: Record<string, any>): Map<string, MaterialInfo> {
  const materials = new Map<string, MaterialInfo>();

  for (const [guid, itemData] of Object.entries(items)) {
    const templateId = itemData?.templateId || '';
    
    // Buscar items de tipo Storage:
    if (templateId.startsWith('Storage:')) {
      const quantity = itemData?.quantity || 0;
      
      if (quantity > 0) {
        // Extraer nombre del material del templateId (ej: "Storage:reagent_people" -> "reagent_people")
        const materialName = templateId.replace('Storage:', '');
        
        materials.set(materialName, {
          name: materialName,
          guid,
          quantity,
          templateId,
        });
      }
    }
  }

  return materials;
}

/**
 * Transfiere materiales desde el almacenamiento al inventario principal
 */
export async function transferMaterials(
  accountId: string,
  accessToken: string
): Promise<boolean> {
  try {
    // Obtener perfil theater0 (donde están los materiales en storage)
    const profile = await composeMCP({
      profile: 'theater0',
      operation: 'QueryProfile',
      accountId,
      accessToken,
    });

    const items = profile.profileChanges?.[0]?.profile?.items || {};

    // Extraer materiales del perfil
    const materials = extractMaterialsFromProfile(items);

    if (materials.size === 0) {
      return true;
    }

    // Crear operaciones de transferencia
    const transferOperations: TransferOperation[] = [];

    for (const [materialName, materialInfo] of materials.entries()) {
      if (materialInfo.guid && materialInfo.quantity > 0) {
        transferOperations.push({
          itemId: materialInfo.guid,
          quantity: materialInfo.quantity,
          toStorage: false, // false = sacar del storage al inventario
          newItemIdHint: '',
        });
      }
    }

    if (transferOperations.length === 0) {
      return true;
    }

    // Ejecutar StorageTransfer en theater0
    await composeMCP({
      profile: 'theater0',
      operation: 'StorageTransfer',
      accountId,
      accessToken,
      body: { transferOperations },
    });

    return true;
  } catch (error: any) {
    return false;
  }
}
