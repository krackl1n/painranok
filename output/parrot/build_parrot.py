from pathlib import Path

out = ['RECTANGLE(-4,-5,4,4)', 'RECTBMP(800,900)', 'ARGUMENT x,y', '',
       '// Только окружности и прямые через две точки.',
       '// Окружность: 1-((x-cx)/r)^2-((y-cy)/r)^2.',
       '// Прямая: (y1-y2)*x-(x1-x2)*y+(y2*x1-y1*x2).',
       '// Вершины многоугольников идут против часовой стрелки.', '']

def circle(name, cx, cy, r):
    out.append(f'FUNCTION {name}=1-((x-({cx}))/{r})^2-((y-({cy}))/{r})^2')

def line(name, prefix, a, b):
    out.append(f'CONSTANT {prefix}x1={a[0]}, {prefix}y1={a[1]}, {prefix}x2={b[0]}, {prefix}y2={b[1]}')
    out.append(f'FUNCTION {name}=({prefix}y1-{prefix}y2)*x-({prefix}x1-{prefix}x2)*y+({prefix}y2*{prefix}x1-{prefix}y1*{prefix}x2)')

def polygon(name, prefix, points):
    area = sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(points,points[1:]+points[:1]))
    if area < 0: points = list(reversed(points))
    out.append(f'// {name}: координаты вершин')
    out.append('CONSTANT '+', '.join(f'{prefix}x{i}={x}, {prefix}y{i}={y}' for i,(x,y) in enumerate(points,1)))
    for i in range(1,len(points)+1):
        j = i%len(points)+1
        out.append(f'FUNCTION {name}L{i}=({prefix}y{i}-{prefix}y{j})*x-({prefix}x{i}-{prefix}x{j})*y+({prefix}y{j}*{prefix}x{i}-{prefix}y{i}*{prefix}x{j})')
    out.append(f'FUNCTION {name}='+'&'.join(f'{name}L{i}' for i in range(1,len(points)+1)))
    out.append('')

def rectangle(name,prefix,x1,y1,x2,y2):
    polygon(name,prefix,[(x1,y1),(x2,y1),(x2,y2),(x1,y2)])

out.append('// Тело и голова — окружности')
circle('Body',-.25,.25,1.6)
circle('Head',.15,2.05,1.0)
out.append('')
polygon('Tail','t', [(-.8,-.95),(.35,-.95),(-1.25,-4.0)])
out.append('// Клюв: окружность, полуплоскость и вычитание окружности')
circle('BeakCircle',1,2.05,1.05)
line('BeakSide','b',(.68,3),(.68,1))
out.append('FUNCTION BeakOuter=BeakCircle&BeakSide')
circle('BeakCut',1.76,1.45,.66)
out.extend(['FUNCTION Beak=BeakOuter&(-BeakCut)', ''])
rectangle('Leg','l',-.32,-2.05,.28,-1.12)
rectangle('Perch','p',-3,-2.25,3,-2)
out.extend(['','// Крыло и глаз — окружности'])
circle('WingOuter',-.42,.3,.9)
circle('WingInner',-.28,.38,.82)
line('WingSide','k',(1,.6),(-1,.6))
out.extend(['FUNCTION WingLine=WingOuter&(-WingInner)&WingSide',''])
circle('Eye',.58,2.42,.17)
circle('Pupil',.62,2.42,.07)
out.append('')
out.extend(['// Сборка фигуры. Вычитание: A&(-B).',
'FUNCTION Bird=Body|Head|Tail|Beak|Leg|Perch',
'FUNCTION Details=Eye|WingLine',
'FUNCTION W=(Bird&(-Details))|Pupil',
'RETURN W',''])
Path(__file__).with_name('parrot.dat').write_text('\n'.join(out))
