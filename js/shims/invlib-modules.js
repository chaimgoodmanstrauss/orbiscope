// Orbiscope shim for vendor/symmhub/lib/invlib/modules.js (SymmHub commit in vendor/SOURCE.md).
// index.html's import map points every import of that file here. It is the
// original aggregator minus twgl and uilib (which pull in dat.gui); the
// Param* classes it used to re-export are not used by orbilib, so they are
// stubbed. Regenerate the export list if SymmHub's invlib/modules.js changes.


export {

    isDefined,
    isFunction,
    getParam,
    setParamsIfDefined,
    setControllersValues,
    inspectProperties,
    addLineNumbers,
    arrayEqualArray,
    arrayInArray,
    arrayReverse,
    objectToString,
    arrayToString,
    iArrayToString,
    splanesToString,
    transformToString,
    // math shortcuts
    PI,
    TPI,
    HPI,
    TORADIANS,
    TODEGREE,
    normalizeAngle,
    EPSILON,
    INFINITY,
    SHORTEPSILON,
    SHORTEREPSILON,

    // for convenience; could convert to, say, Stampfli's Fast methods

    pow,
    log,
    cos,
    sin,
    sec,
    csc,
    tan,
    cot,
    cosh,
    tanh,
    acosh,
    asin,
    atan,
    atan2,
    asinh,
    atanh,
    sinh,
    coth,
    abs,
    sqrt,
    exp,
    min,
    max,
    mod,
    random,
    sign,

    lerp,

    //color utilities

    hexToRGBA,
    premultColor,

    writeToJSON,
    writeCanvasToFile,
    writeBlobToFile,
    getCanvasPnt, 
}
from '../../vendor/symmhub/lib/invlib/Utilities.js';

export {
    isEpsilonEqualU4,
    H4toU4,
    U4toH4,
    iReflect,
    iReflectH4,
    iReflectU4,
    iDistanceU4,
    iPackDomain,
    iPackRefCount,
    iPackTransforms,
    iLerpU4,
    iGetFactorizationU4,
    iInverseTransformU4,
    iGetInverseTransform,
    iTransformU4,
    iDifferenceU4,
    iGetBisectorU4, 
    iGetBisectorH4, 
    isProperReflection,
}
from '../../vendor/symmhub/lib/invlib/Inversive.js';

// AnimationControl omitted: it tries to load JSZip at import time and nothing in orbilib uses it.

export {
    distance1,
    eDistance,
    add,
    addSet,
    mulSet,
    sub,
    subSet,
    mul,
    dot,
    cross,
    copy,
    combineV,
    lerpV,
    getCopy,
    normalize,
    orthogonalize,
    eLength,
    eLengthSquared,
    eDistanceSquared,
}
from '../../vendor/symmhub/lib/invlib/LinearAlgebra.js';

export {
    getCSSColor,
    CSSColors,
}
from '../../vendor/symmhub/lib/invlib/CSSColors.js';

export {
    Globals,
}
from '../../vendor/symmhub/lib/invlib/Globals.js';

export {
    IdentityWorldTransform,
}
from '../../vendor/symmhub/lib/invlib/IdentityWorldTransform.js';

export {
    complexN,
    cDiv,
    cMul, 
    cSub,
    cAdd,
    cBand2Disk,
    cDisk2Band,
    cExp,
    cLog,
    cPolar,
    cAbs,
    cAbs2, 
    cArg,
    conj, 
    cPow,     
    transformFromCenterToPoint,
}
from '../../vendor/symmhub/lib/invlib/ComplexArithmetic.js';

export {
    ObjectId
}
from '../../vendor/symmhub/lib/invlib/ObjectId.js';

export {
    ITransform
}
from '../../vendor/symmhub/lib/invlib/ITransform.js'

export {
    splaneToString,
    SPLANE_PLANE,
    SPLANE_SPHERE,
    SPLANE_POINT,
    iPlane,
    iSphere,
    iPoint,
}
from '../../vendor/symmhub/lib/invlib/ISplane.js';

export {
    PlaneNavigator
}
from '../../vendor/symmhub/lib/invlib/PlaneNavigator.js';

export {
    CanvasTransform
}
from '../../vendor/symmhub/lib/invlib/CanvasTransform.js';

export {
    Group
}
from '../../vendor/symmhub/lib/invlib/Group.js';

export {
    GroupUtils
}
from '../../vendor/symmhub/lib/invlib/GroupUtils.js';

export {
    SpatialHashMap
}
from '../../vendor/symmhub/lib/invlib/SpatialHashMap.js';

export {
    iSplane
}
from '../../vendor/symmhub/lib/invlib/ISplane.js';

export {
    U4
}
from '../../vendor/symmhub/lib/invlib/U4.js';

export {
    iDrawSplane,
    iDrawCircle, 
}
from '../../vendor/symmhub/lib/invlib/IDrawing.js';

export {
    EventProcessor,
}
from '../../vendor/symmhub/lib/invlib/EventProcessor.js';


class ParamStub { constructor() { throw new Error('Param UI is not available in Orbiscope'); } }
export const ParamChoice = ParamStub, ParamInt = ParamStub, ParamBool = ParamStub,
  ParamFloat = ParamStub, ParamFunc = ParamStub, ParamGroup = ParamStub, ParamObj = ParamStub,
  ParamColor = ParamStub, ParamString = ParamStub, ParamCustom = ParamStub;
export function createParamUI() {}
export function getParamValues() { return {}; }
export function setParamValues() {}
export function updateParamDisplay() {}
export function loadJS() {}
export const TW = null;
