const names = Object.freeze({
  HOSPITAL: '医院', ROOT: '医院',
  DEPARTMENT: '科室', DEPT: '科室', OUT_DEPT: '科室', IN_DEPT: '科室', CHANGE_DEPT: '科室',
  DOCTOR: '医生', ATTENDING_DOCTOR: '医生'
})

export function organizationLevelName(pathCode, levelCode, fallback = '') {
  return String(pathCode || '').toUpperCase() === 'ORGANIZATION'
    ? names[String(levelCode || '').toUpperCase()] || fallback : fallback
}

export function normalizeOrganizationPath(path) {
  if (!path?.levels?.length || String(path.pathCode).toUpperCase() !== 'ORGANIZATION') return path
  return { ...path, levels: path.levels.map(level => ({ ...level,
    levelName: organizationLevelName(path.pathCode, level.levelCode, level.levelName)
  })) }
}
