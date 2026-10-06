"""Explicit source-vertex rings for V5; no coordinate-based weight function.

Order runs inner/superior -> superior -> outer -> inferior -> inner/inferior.
Coincident UV/normal seam vertices are recorded as aliases, never welded.
"""
RINGS = {
    'P3': [631,636,622,635,623,637,624,634,625,628,629,752,632,626,627,621,630],
    'P2': [469,464,589,465,578,463,567,466,555,471,473,753,467,545,472,600,470],
    'P1': [456,430,587,435,576,429,565,442,553,431,461,750,447,543,432,598,455],
    'P0': [538,531,595,534,584,530,573,535,562,532,540,759,536,551,533,606,539],
    'H': [454,422,585,433,574,420,563,641,642,640,639,421,459,749,444,541,423,597,453],
    'D1': [713,706,726,708,724,704,720,529,561,698,716,764,710,718,702,728,714],
    'D2': [703,705,701,699,707,709,700,729,727,719,725,765,721,712,715,717,723],
    'D3': [458,437,588,440,577,436,566,443,554,438,462,751,449,544,439,599,457],
    'D4': [489,591,493,580,485,569,505,557,500,525,755,509,547,504,602,521,517],
}
ALIASES = {632:633,467:468,447:448,536:537,444:445,710:711,721:722,449:450,509:510}
PATCHES = {'P0-H': [649,643,648,647], 'H-D1': [646,644,645,638]}

# Lower-arm influence, one explicit value per ordered mesh vertex above.
# The upper-arm influence is its complement. No longitudinal interpolation.
PAINT = {
    'P2': [.02,.01,.01,.015,.025,.05,.07,.08,.08,.07,.065,.05,.04,.02,.01,.005,.01],
    'P1': [.035,.045,.075,.10,.16,.22,.28,.30,.30,.27,.23,.20,.15,.09,.035,.025,.025],
    'P0': [.18,.25,.35,.42,.44,.46,.48,.49,.49,.46,.43,.40,.35,.27,.17,.13,.13],
    'H':  [.62,.71,.77,.78,.77,.74,.72,.71,.70,.70,.70,.70,.68,.64,.60,.58,.55,.54,.56],
    'D1': [.88,.90,.94,.94,.93,.91,.89,.86,.85,.86,.88,.89,.90,.90,.88,.86,.85],
    'D2': [.98,.985,.99,.99,.985,.98,.97,.95,.95,.96,.97,.98,.985,.985,.98,.97,.97],
}
PATCH_PAINT = {649:.59,643:.60,648:.60,647:.59,646:.79,644:.78,645:.78,638:.78}
STAGES = ('outer', 'circumference', 'final')

def left_paint(stage):
    assert stage in STAGES
    result = {}
    for ring, values in PAINT.items():
        assert len(RINGS[ring]) == len(values)
        for n, (vertex, weight) in enumerate(zip(RINGS[ring], values)):
            if stage == 'outer' and not (4 <= n < (14 if ring == 'H' else 12)):
                continue
            result[vertex] = weight
    result.update(PATCH_PAINT)
    for source, alias in ALIASES.items():
        if source in result:
            result[alias] = result[source]
    return result
