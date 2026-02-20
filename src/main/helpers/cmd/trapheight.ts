/**
 * Trap Height Modifier – Binary-patch pakchunk11-WindowsClient.ucas
 *
 * Searches for a trap's GUID as ASCII text in the file, then modifies
 * the 2-byte height value at a known offset before the GUID.
 *
 * Uses a streaming approach since the file is ~4 GB.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Storage } from '../../storage';

// ── Constants ───────────────────────────────────────────────

const CHUNK_FILE = 'pakchunk11-WindowsClient.ucas';
const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB read chunks
const OVERLAP = 32; // overlap for boundary matching (GUID = 32 ASCII chars)

// ── Height presets ──────────────────────────────────────────

export const HEIGHT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Under floor (with floor)', hex: 'AD 43' },
  { label: 'Under floor (without floor)', hex: 'D2 C3' },
  { label: 'Inside floor (ALL)', hex: '20 C2' },
  { label: 'Inside floor (freeze)', hex: 'C8 C1' },
  { label: 'Inside floor (tar pit)', hex: '74 C2' },
  { label: 'Hill / stair', hex: '19 43' },
  { label: 'Lower zones (no floor)', hex: 'AE 43' },
  { label: 'Upper zones (no floor)', hex: 'AF 43' },
  { label: 'All zones (with floor)', hex: 'B3 43' },
  { label: '1.3x all zones (with floor)', hex: 'E1 43' },
  { label: '-1.3x all zones (with floor)', hex: 'E8 C3' },
  { label: 'Default floor traps (-10)', hex: '20 C1' },
  { label: 'Default wooden spikes (-5)', hex: 'A0 C0' },
];

// ── Trap database ───────────────────────────────────────────
// Each entry: [name, guid, defaultHeightHex, description]

interface TrapEntry {
  name: string;
  guid: string;
  defaultHeight: string;
  desc: string;
}

// Parsed from trap_guids_all.csv — 342 traps
// Only include traps that can be found in raw file (uncompressed blocks)
// and whose height offset can be auto-detected
const TRAP_DATA: TrapEntry[] = [
  // ── Flame Grill Floor Trap ─────────────────────────────
  { name: 'TID_Floor_FlameGrill_R_T01', guid: 'D61E3298474B748879057B80FA095DD6', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_R_T02', guid: '058A615842D51743AC89CE82D9AAE1A2', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_R_T03', guid: '8B903E564325D1B88F5A3185DAED264F', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_R_T04', guid: 'A490E10F461E5C6480BB57831254A21D', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_SR_T01', guid: '43DCC80C444A1F24853DDE95EB766D5D', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_SR_T02', guid: '7746BA324A2E3F90F857D9BF6631D29C', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_SR_T03', guid: '39AEABE247372F820C6C309C2E7A841B', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_SR_T04', guid: '5F8DE7B24481F3053A4678B3AA523A3E', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_SR_T05', guid: 'CA2D14B046A9CF0DD51945B6B873AA3D', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_VR_T01', guid: 'BACA3C5C4A4EF3C6BA146691B5574489', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_VR_T02', guid: 'F7CBF4A24DD3F25990D0DC9300526D04', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_VR_T03', guid: 'B83EAF644777C8CFD112189D86A39086', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_VR_T04', guid: '5E92CC964684744F07AF7CA4D809A8A2', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },
  { name: 'TID_Floor_FlameGrill_VR_T05', guid: 'E1F0AB01440482D67FEC0C862B87541D', defaultHeight: '20 C1', desc: 'Flame Grill Floor Trap' },

  // ── Floor Freeze Trap ──────────────────────────────────
  { name: 'TID_Floor_Freeze_R_T01', guid: 'FD4EF4584AEADE91CC8DCAA4A6B034D8', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_R_T02', guid: '82D9035C4DFF2A084AFB6FB6DA9280FA', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_R_T03', guid: '6F7F17914B39AC90F9E5FA8FC1F28D9E', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_R_T04', guid: '1311544543D879A506FB29A728B6CF16', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_SR_T01', guid: 'DA528E5C40FB3ACAA36304BCE1F382CC', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_SR_T02', guid: '34DE7E3446847FF369FB3C868DF23912', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_SR_T03', guid: '8B0E1DD34F948062597D04912F38528F', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_SR_T04', guid: 'A827163C4175DE1DE0458F924440C26F', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_SR_T05', guid: '7EFA04D44D909CA6598FCCAB13E94966', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_VR_T01', guid: 'B060CB7D4B9A48BB1BCB868F6C8F78FB', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_VR_T02', guid: '24F276144E0863A5700190A2F5DB47FF', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_VR_T03', guid: '6202B2A44356FC6EAE6B0D8C386D5BCD', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_VR_T04', guid: 'D9492BE34AABD0228FB46689E1CF9377', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },
  { name: 'TID_Floor_Freeze_VR_T05', guid: '2AE9C3C94F0436EE37317E9D27803FC3', defaultHeight: '20 C1', desc: 'Floor Freeze Trap' },

  // ── Retractable Floor Spikes ───────────────────────────
  { name: 'TID_Floor_Spikes_R_T02', guid: 'B4605A0447C27D7A05B3E89248DFBDD3', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_R_T03', guid: '6AC5467E41A4441E26EEA7A807216245', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_R_T04', guid: 'F8040E3C40830707D5F1A5B83CAF2B16', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_SR_T01', guid: '0E399D7D4E3759AF4BF5CCAC85B27374', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_SR_T02', guid: 'F9257ECF4CCEE4FC0AC9E69A060270A5', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_SR_T03', guid: '6ABD62444B27EEAF4DC3F5AF0933B8E8', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_SR_T04', guid: 'AB7F79AC4C8B1ED1738965BF2B185599', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_SR_T05', guid: 'A625302E44849DFD802AABB623D64D75', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_UC_T01', guid: 'F192F0AE461E7734F85E3E8D5EBE5042', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_UC_T02', guid: '3FBD4BA64D72B53D6621BB9DC0C5E476', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_UC_T03', guid: 'BE0ED6B04ADB915FB7830F89D6453D24', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_VR_T01', guid: 'B512F9A24637C9BF6306B3990400A8C8', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_VR_T02', guid: '6049515D44E89587849A5286F11D2DC4', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_VR_T03', guid: '231135984A381F931F3C2683546A42A4', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_VR_T04', guid: 'B137EEED40B10D72AE55E39460E27F54', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },
  { name: 'TID_Floor_Spikes_VR_T05', guid: '3DF84C504A501D90A3B11FB79A8614E5', defaultHeight: '20 C1', desc: 'Retractable Floor Spikes' },

  // ── Wooden Floor Spikes ────────────────────────────────
  { name: 'TID_Floor_Spikes_Wood_R_T01', guid: '077D113D4EB83C71CC4103AE5568A41A', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_R_T03', guid: 'C77B1FAD4EC5F085F218D1A499537E48', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_SR_T03', guid: '9CF19967460749F08783D78F04FEA08F', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_UC_T01', guid: '6193115B478C72C2342CB982AEFD644F', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_UC_T02', guid: '3D9F5A3E41BCC79D96DED493C4A4DAE5', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_UC_T03', guid: 'E4CFF74F45D0595DBA9DB2842D3F0795', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_VR_T03', guid: 'D832BE584EFB90AFC329D5A4E25563FE', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_VR_T04', guid: 'C54FDEEA4B8D63BE18D15C9FDE09D1FE', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },
  { name: 'TID_Floor_Spikes_Wood_VR_T05', guid: 'B4D676DE4D651A83063CC2B7190717EB', defaultHeight: 'A0 C0', desc: 'Wooden Floor Spikes' },

  // ── Tar Pit ────────────────────────────────────────────
  { name: 'TID_Floor_Tar_R_T02', guid: '4F49EF0D432875FD105DABB15667FC7E', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_R_T03', guid: 'DE8B4E7E4EA897D7699A38B58EA32129', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_R_T04', guid: '0ABACA06476CDC65F6105F85065C57F9', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_SR_T01', guid: '8CC5FC164C01BF5A2D8657A19C464BDD', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_SR_T02', guid: '38AD9D914E01E7042AD78C8DF833CE64', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_SR_T03', guid: '1EDB727448FD8AFA233D77B1A6068BA4', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_SR_T04', guid: 'AC99F0DE446677CB89E6BBA5C2555792', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_SR_T05', guid: '27A4F5214DCEA15F5FB4728372CB072C', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_VR_T01', guid: '6F000BAC4E9A4882AD7E03A0AA503036', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_VR_T02', guid: 'F0AF223344EFBE5A6F2B3E885F785B7F', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_VR_T03', guid: 'C4BF64D0478CE66ECA01F88ABC36E2AF', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_VR_T04', guid: '1432258B416C04D3593465826AE9D62F', defaultHeight: '20 C1', desc: 'Tar Pit' },
  { name: 'TID_Floor_Tar_VR_T05', guid: '195408AE456A0C18F10768AD47EC702E', defaultHeight: '20 C1', desc: 'Tar Pit' },

  // ── Floor Launcher ─────────────────────────────────────
  { name: 'TID_Floor_Launcher_R_T01', guid: 'C06293534B9155EDCD2359822B06BEC2', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_R_T02', guid: '58BE970E46E9130D7C5B9AB4B9EA18F1', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_R_T03', guid: 'F558E6634638DF578D3565BD62B3D24E', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_R_T04', guid: 'E80F2C714AE8FF25F509DCB9068D3153', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_SR_T01', guid: 'CF00187A47DA16BDAA8CD5BE0DFAB2B4', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_SR_T02', guid: '70FF5463414FFE2070C8F88FA2554EFE', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_SR_T03', guid: '813115724C5D56D9E83EA6BED5C3CE06', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_SR_T04', guid: '98CA67CC4D1C5195FE67599E5530DD47', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_SR_T05', guid: '1FAD7FB44EF644E082A9DD8E517C963E', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_UC_T01', guid: 'EDEBC4334A65F3125C82B28AAFF80922', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_UC_T02', guid: 'DEF28A0A41F24E78B396A898E025C0EA', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_UC_T03', guid: '3B2017574812991729925697E15DD300', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_VR_T01', guid: '4D5C18F546BC9C761846A5BF83399A6C', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_VR_T02', guid: '071CD55C48B9EAD3C03C42B8AB90C856', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_VR_T03', guid: '33110F3A45E9618DEA6627B207D36710', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_VR_T04', guid: '4D0A20064D9C15B743C9099E968A0123', defaultHeight: '70 C1', desc: 'Floor Launcher' },
  { name: 'TID_Floor_Launcher_VR_T05', guid: '9B9C78C046750067DF17FA8B0FA3775B', defaultHeight: '70 C1', desc: 'Floor Launcher' },

  // ── Anti-Air Trap ──────────────────────────────────────
  { name: 'TID_Floor_Ward_R_T01', guid: '943C809E4B761A38CB95869437AF240F', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_R_T02', guid: '3C2056084ACAAFB5FB8C61B526254AFA', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_R_T03', guid: 'ED51C52F43B46D809BB51AAFF89EE897', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_R_T04', guid: 'DDD81FAA4AD81768A5A49E9F1D973818', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_SR_T01', guid: '2D849A034C00EBE5E9B413904DB66E32', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_SR_T02', guid: '961F36C34F86BB92AD908B8ACE983669', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_SR_T03', guid: '7140D26F4680A70AD98D25907535C77D', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_SR_T04', guid: 'E7123B684880472C1DCDBC988487C163', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_SR_T05', guid: '676E36904D09E69F0382F39331716CF2', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_UC_T01', guid: '714D28A34CF939F59429AAB45DDF4796', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_UC_T02', guid: '6F28F3994D85E6FF162CF8B761AD4D12', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_UC_T03', guid: 'CF28F8A940A1DC14E3E146B8FEF8575A', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_VR_T01', guid: '0FFEB6324E6C6C52D342888648A2FB42', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_VR_T02', guid: '5520F2CC49BE15E0D63B22B3165B6769', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_VR_T03', guid: '43575BAC47A9D4B91EF48B8D0129DF8F', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_VR_T04', guid: '177022B245906582931F74B805A950D6', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },
  { name: 'TID_Floor_Ward_VR_T05', guid: '7422D50B4A763D75EE9EFF9448ACBBFA', defaultHeight: '70 C1', desc: 'Anti-Air Trap' },

  // ── Defender Pad ───────────────────────────────────────
  { name: 'TID_Floor_Defender', guid: 'A322BA854FF2027AA83F5B9253EC473A', defaultHeight: '20 C1', desc: 'Defender Pad' },

  // ── Wall Launcher ──────────────────────────────────────
  { name: 'TID_Wall_Launcher_R_T01', guid: '003760A641FF5ECE15AA52861B1AE1E2', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_R_T02', guid: '32ED116C42CBD504EC2D528A777B30B5', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_R_T03', guid: '4DBFF6B7427D8E9F82D9FBB79C1BEC46', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_R_T04', guid: 'B7CCD99D4390FABEBCEB7AB49683F688', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_SR_T01', guid: 'BE5A0F4D41EE58410EB9D1984DB2A11A', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_SR_T02', guid: '8064981946C69DD036CD41825234F956', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_SR_T03', guid: '256A9C684755FEC10D0CBC9E13693E49', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_SR_T04', guid: '61FCB3BD428331909935289730F3BE07', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_SR_T05', guid: '7A4A45DF4AC1505B93C0D6B66A383A1E', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_UC_T01', guid: 'BB0B312348F0D0593B399D8B39B113A3', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_UC_T02', guid: '284A5B1040F8C4645D7D5F9F681FBB48', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_UC_T03', guid: '888F0DFC489DEE8C9DA197B6013DE88D', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_VR_T01', guid: '4CC06CFB4889483C2270E69B586F1E0D', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_VR_T02', guid: '1EE89F7348EF49C4EC9DFC9AE8D9D1EC', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_VR_T03', guid: '1E1140554A22E4BC28FCA4AE109014B3', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_VR_T04', guid: '89EED7524FB1F3120AAE65960568039F', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },
  { name: 'TID_Wall_Launcher_VR_T05', guid: '6C0DF88A4035D4E4FF18E6852FA29409', defaultHeight: 'A0 C1', desc: 'Wall Launcher' },

  // ── Wall Dynamo ────────────────────────────────────────
  { name: 'TID_Wall_Electric_R_T02', guid: '44301E3241F3FA523F94BEBD8CD65E7D', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_R_T03', guid: 'E63228CC46781D109D1EEEBC6A359780', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_R_T04', guid: 'E3B4BD35498A45D2A83E83806D898237', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_SR_T01', guid: '139558624ED23D6D4B3C0CBCFE9BFE42', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_SR_T02', guid: '9F0F95BC46C220DDF7A8868D634A8C71', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_SR_T03', guid: '82C1C886497E0E758F94C99B837BBFC7', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_SR_T04', guid: '5BA28C754712AFC61D70C0BD4A7906AE', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_SR_T05', guid: '1E3D384B4DB3B9491D50FAA44D290501', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_UC_T01', guid: '082EE71B4CD695EDCDAF08A733046F66', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_UC_T02', guid: '6A7647B04E4CD23524F8CA8720991553', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_UC_T03', guid: 'CA6EFC3B46F688338604D8938E3E9092', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_VR_T01', guid: '3B9300B148457B6ADA2A3E97AEDBEF47', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_VR_T02', guid: '2E273D1947C0C4EAA1C1AABAC02926B0', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_VR_T04', guid: 'AE6856FC4A101D714D0FF6B9A3788A25', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },
  { name: 'TID_Wall_Electric_VR_T05', guid: '4555998A4A05E42458AF96ACA49564A5', defaultHeight: 'A0 C1', desc: 'Wall Dynamo' },

  // ── Wall Lights ────────────────────────────────────────
  { name: 'TID_Wall_Light_R_T01', guid: '2DD8661145C8A03945BB0DB76C464F24', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_R_T02', guid: 'A3201FB14B0C12A12103F4BADAFBD096', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_R_T03', guid: '331AF2FD465D2B4CB43B18B171E86F52', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_R_T04', guid: 'C6A9053C4FFA60674A45A99DE8F80AB9', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_SR_T01', guid: '01C420264D0FC89790C4798502BAADA2', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_SR_T02', guid: '0A94E56C4A9ADA0C41AB4D81DE3A3164', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_SR_T03', guid: '360322D640788BB58ECC6BA743F982DB', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_SR_T04', guid: '2E7A206D44BD5E60577E85BB1AA22AAC', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_SR_T05', guid: '8C65D6A846745A31843172B63888EB5A', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_VR_T01', guid: '5B5C8E2B494B345CA4B04FA989EAF883', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_VR_T02', guid: '51A1E36C43CC248C7085D7B4CFEE02C0', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_VR_T03', guid: '81BA0E7D411FFB052F2D64885E11BC80', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_VR_T04', guid: 'DE397EB042994EE2A234519A31FE0AFE', defaultHeight: 'A0 C1', desc: 'Wall Lights' },
  { name: 'TID_Wall_Light_VR_T05', guid: '88752DD14E48EA7F4C2E20B082F0B099', defaultHeight: 'A0 C1', desc: 'Wall Lights' },

  // ── Broadside ──────────────────────────────────────────
  { name: 'TID_Wall_Cannons_R_T01', guid: '3C080D34438AB7ADECBE52A9D3FE8108', defaultHeight: 'F0 C1', desc: 'Broadside' },

  // ── Zap-o-max ──────────────────────────────────────────
  { name: 'TID_Wall_Mechstructor_SR_T02', guid: '8780F3CA4E5D8796AFD01391A5F2C511', defaultHeight: 'A0 C1', desc: 'Zap-o-max' },
  { name: 'TID_Wall_Mechstructor_SR_T04', guid: 'F6F4B0E1417676CB45019C8EF8CD429F', defaultHeight: 'A0 C1', desc: 'Zap-o-max' },
  { name: 'TID_Wall_Mechstructor_VR_T01', guid: '25D7F95A42BF92864E64C8948902DA77', defaultHeight: 'A0 C1', desc: 'Zap-o-max' },
  { name: 'TID_Wall_Mechstructor_VR_T04', guid: '1060C6994DFC9BF3D6969596124E3E33', defaultHeight: 'A0 C1', desc: 'Zap-o-max' },
];

// ── Interfaces ──────────────────────────────────────────────

export interface TrapPatchState {
  guidFilePos: number;
  heightOffset: number;
  originalHeight: string; // "20 C1"
  currentHeight: string;  // "AD 43"
  trapName: string;
}

export interface TrapListItem {
  name: string;
  guid: string;
  desc: string;
  defaultHeight: string;
  rarity: string;
  tier: string;
}

export interface TrapHeightResult {
  success: boolean;
  message: string;
  currentHeight?: string;
  isModified?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

function parseHex(hex: string): [number, number] {
  const parts = hex.trim().split(/\s+/);
  return [parseInt(parts[0], 16), parseInt(parts[1], 16)];
}

function parseTrapName(name: string): { rarity: string; tier: string } {
  const m = name.match(/_(C|UC|R|VR|SR)_(T\d+)$/);
  if (m) return { rarity: m[1], tier: m[2] };
  return { rarity: '-', tier: '-' };
}

/**
 * Resolve pakchunk11-WindowsClient.ucas from Fortnite path.
 */
async function resolveUcasPath(storage: Storage): Promise<string | null> {
  const settings = (await storage.get<{ fortnitePath?: string }>('settings')) ?? {};
  const rawPath = settings.fortnitePath || 'C:\\Program Files\\Epic Games\\Fortnite';
  const norm = path.resolve(rawPath);

  const candidates = [
    path.join(norm, 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, 'Paks', CHUNK_FILE),
    path.join(norm, CHUNK_FILE),
    path.join(norm, '..', '..', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, '..', 'Content', 'Paks', CHUNK_FILE),
    path.join(norm, '..', '..', '..', 'FortniteGame', 'Content', 'Paks', CHUNK_FILE),
  ];

  for (const p of candidates) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

/**
 * Stream-search for a GUID's ASCII text in the .ucas file.
 * Returns byte offset or -1.
 */
function findGuidInFile(filePath: string, guid: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const needle = Buffer.from(guid, 'ascii');
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let fileOffset = 0;
    let carry = 0;

    const read = () => {
      const bytesRead = fs.readSync(fd, buf, carry, CHUNK_SIZE, fileOffset);
      if (bytesRead === 0) {
        if (carry > 0) {
          const idx = buf.subarray(0, carry).indexOf(needle);
          if (idx >= 0) {
            fs.closeSync(fd);
            return resolve(fileOffset - carry + idx);
          }
        }
        fs.closeSync(fd);
        return resolve(-1);
      }

      const total = carry + bytesRead;
      const idx = buf.subarray(0, total).indexOf(needle);
      if (idx >= 0) {
        fs.closeSync(fd);
        return resolve(fileOffset - carry + idx);
      }

      if (total > OVERLAP) {
        buf.copy(buf, 0, total - OVERLAP, total);
        carry = OVERLAP;
      } else {
        carry = total;
      }

      fileOffset += bytesRead;
      setImmediate(read);
    };

    try {
      read();
    } catch (err) {
      try { fs.closeSync(fd); } catch {}
      reject(err);
    }
  });
}

/**
 * Discover the height byte offset by scanning backwards from the GUID
 * position, looking for the known default height bytes.
 */
function discoverHeightOffset(filePath: string, guidPos: number, defaultHeight: string): number | null {
  const [h0, h1] = parseHex(defaultHeight);

  // Read 64 bytes before the GUID
  const before = Buffer.alloc(64);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, before, 0, 64, guidPos - 64);
  fs.closeSync(fd);

  // Search backwards (closest match wins)
  for (let i = 62; i >= 0; i--) {
    if (before[i] === h0 && before[i + 1] === h1) {
      return 64 - i;
    }
  }
  return null;
}

/**
 * Write 2 bytes at a specific file position.
 */
function patchBytes(filePath: string, position: number, b0: number, b1: number): void {
  const fd = fs.openSync(filePath, 'r+');
  const buf = Buffer.from([b0, b1]);
  fs.writeSync(fd, buf, 0, 2, position);
  fs.closeSync(fd);
}

/**
 * Read 2 bytes at a specific file position.
 */
function readBytes(filePath: string, position: number): [number, number] {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, position);
  fs.closeSync(fd);
  return [buf[0], buf[1]];
}

// ── Public API ──────────────────────────────────────────────

/**
 * Get the full trap catalog, grouped and parsed.
 */
export function getTrapList(): TrapListItem[] {
  return TRAP_DATA.map(t => {
    const parsed = parseTrapName(t.name);
    return {
      name: t.name,
      guid: t.guid,
      desc: t.desc,
      defaultHeight: t.defaultHeight,
      rarity: parsed.rarity,
      tier: parsed.tier,
    };
  });
}

/**
 * Get the current status of a specific trap's height modification.
 */
export async function getTrapStatus(
  storage: Storage,
  guid: string,
): Promise<{ found: boolean; isModified: boolean; currentHeight: string | null; error?: string }> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { found: false, isModified: false, currentHeight: null, error: `${CHUNK_FILE} not found. Check Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { found: false, isModified: false, currentHeight: null, error: 'Unknown trap GUID' };
  }

  // Check stored patch state first
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const state = patches[guid];

  if (state) {
    // Verify the stored position still has a valid GUID
    try {
      const [b0, b1] = readBytes(filePath, state.guidFilePos - state.heightOffset);
      const currentHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                         b1.toString(16).padStart(2, '0').toUpperCase();
      const isModified = currentHex !== trap.defaultHeight;
      return { found: true, isModified, currentHeight: currentHex };
    } catch {
      // Fall through to re-scan
    }
  }

  // No stored state — need to search
  try {
    const guidPos = await findGuidInFile(filePath, guid);
    if (guidPos < 0) {
      return { found: false, isModified: false, currentHeight: null, error: 'GUID not found in file (data may be compressed)' };
    }

    const offset = discoverHeightOffset(filePath, guidPos, trap.defaultHeight);
    if (offset === null) {
      return { found: true, isModified: false, currentHeight: null, error: 'Could not auto-detect height offset' };
    }

    const [b0, b1] = readBytes(filePath, guidPos - offset);
    const currentHex = b0.toString(16).padStart(2, '0').toUpperCase() + ' ' +
                       b1.toString(16).padStart(2, '0').toUpperCase();

    // Store the discovered state
    patches[guid] = {
      guidFilePos: guidPos,
      heightOffset: offset,
      originalHeight: trap.defaultHeight,
      currentHeight: currentHex,
      trapName: trap.name,
    };
    await storage.set('trapPatches', patches);

    return { found: true, isModified: currentHex !== trap.defaultHeight, currentHeight: currentHex };
  } catch (err: any) {
    return { found: false, isModified: false, currentHeight: null, error: err.message };
  }
}

/**
 * Apply a height modification to a specific trap.
 */
export async function applyTrapHeight(
  storage: Storage,
  guid: string,
  newHeight: string,
): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { success: false, message: 'Unknown trap GUID.' };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  let state = patches[guid];

  try {
    // If we don't have stored state, search for the GUID
    if (!state) {
      const guidPos = await findGuidInFile(filePath, guid);
      if (guidPos < 0) {
        return { success: false, message: 'GUID not found in file.\nThe trap data may be in a compressed block.' };
      }

      const offset = discoverHeightOffset(filePath, guidPos, trap.defaultHeight);
      if (offset === null) {
        return { success: false, message: 'Could not auto-detect height byte offset.\nThis trap variant may not be supported.' };
      }

      state = {
        guidFilePos: guidPos,
        heightOffset: offset,
        originalHeight: trap.defaultHeight,
        currentHeight: trap.defaultHeight,
        trapName: trap.name,
      };
    }

    // Write the new height bytes
    const [h0, h1] = parseHex(newHeight);
    patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);

    // Update stored state
    state.currentHeight = newHeight;
    patches[guid] = state;
    await storage.set('trapPatches', patches);

    return {
      success: true,
      message: `Height modified: ${trap.desc} → ${newHeight}`,
      currentHeight: newHeight,
      isModified: true,
    };
  } catch (err: any) {
    return { success: false, message: `Patch failed: ${err.message}` };
  }
}

/**
 * Revert a trap's height to its default value.
 */
export async function revertTrapHeight(
  storage: Storage,
  guid: string,
): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const trap = TRAP_DATA.find(t => t.guid === guid);
  if (!trap) {
    return { success: false, message: 'Unknown trap GUID.' };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const state = patches[guid];

  if (!state) {
    return { success: false, message: 'No modification found for this trap.\nNothing to revert.' };
  }

  try {
    const [h0, h1] = parseHex(state.originalHeight);
    patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);

    // Remove from stored patches
    delete patches[guid];
    await storage.set('trapPatches', patches);

    return {
      success: true,
      message: `Height restored: ${trap.desc} → ${state.originalHeight}`,
      currentHeight: state.originalHeight,
      isModified: false,
    };
  } catch (err: any) {
    return { success: false, message: `Revert failed: ${err.message}` };
  }
}

/**
 * Revert ALL modified traps at once.
 */
export async function revertAllTraps(storage: Storage): Promise<TrapHeightResult> {
  const filePath = await resolveUcasPath(storage);
  if (!filePath) {
    return { success: false, message: `${CHUNK_FILE} not found.\nCheck your Fortnite path in Settings.` };
  }

  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  const guids = Object.keys(patches);
  if (guids.length === 0) {
    return { success: true, message: 'No modifications to revert.' };
  }

  let restored = 0;
  let errors = 0;

  for (const guid of guids) {
    const state = patches[guid];
    try {
      const [h0, h1] = parseHex(state.originalHeight);
      patchBytes(filePath, state.guidFilePos - state.heightOffset, h0, h1);
      delete patches[guid];
      restored++;
    } catch {
      errors++;
    }
  }

  await storage.set('trapPatches', patches);
  const msg = `Restored ${restored} trap(s)${errors > 0 ? `, ${errors} error(s)` : ''}`;
  return { success: errors === 0, message: msg };
}

/**
 * Get count of currently modified traps.
 */
export async function getModifiedCount(storage: Storage): Promise<number> {
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  return Object.keys(patches).length;
}

/**
 * Get list of all currently modified traps with their state.
 */
export async function getModifiedTraps(storage: Storage): Promise<{ guid: string; name: string; currentHeight: string; desc: string; rarity: string; tier: string }[]> {
  const patches = (await storage.get<Record<string, TrapPatchState>>('trapPatches')) ?? {};
  return Object.entries(patches).map(([guid, state]) => {
    const parsed = parseTrapName(state.trapName);
    const entry = TRAP_DATA.find(t => t.guid === guid);
    return {
      guid,
      name: state.trapName,
      currentHeight: state.currentHeight,
      desc: entry?.desc ?? '',
      rarity: parsed.rarity,
      tier: parsed.tier,
    };
  });
}
